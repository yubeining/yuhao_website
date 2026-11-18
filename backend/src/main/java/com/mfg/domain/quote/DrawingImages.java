package com.mfg.domain.quote;

import com.mfg.platform.ai.AiImage;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * 把图纸转成发给看图模型的 PNG：PDF 取前几页逐页渲染，图片直接缩放；长边不超过 {@link #MAX_SIDE_PX}。
 *
 * <p>长边上限是在「看得清尺寸标注」和「请求体积 / token 费用」之间取的工程值，不是业务规则。
 * STEP / DWG 等格式模型读不了，不处理（调用方会把它们列为「未读取」）。
 * 文件损坏读不出来时返回空列表，不抛 —— 一张坏图不该让整次估算失败。
 */
final class DrawingImages {

    static final int MAX_SIDE_PX = 1600;

    /**
     * 原图像素上限。解码是按原图尺寸整张展开的：一张几 MB 的 PNG 可以是 20000 × 20000，解出来要 1 GB 以上内存。
     * 所以先只读文件头里的宽高，超过上限的不解码、当作读不了。4000 万像素约等于 A0 图纸 200 DPI 扫描件，工程取值。
     */
    static final long MAX_IMAGE_PIXELS = 40_000_000L;

    private static final Logger log = LoggerFactory.getLogger(DrawingImages.class);
    private static final String PNG = "image/png";

    private DrawingImages() {
    }

    static boolean supports(String filename) {
        String ext = extension(filename);
        return ext.equals("pdf") || isImage(ext);
    }

    static List<AiImage> render(String filename, byte[] content, int maxPdfPages) {
        String ext = extension(filename);
        try {
            if (ext.equals("pdf")) {
                return renderPdf(content, maxPdfPages);
            }
            if (isImage(ext)) {
                if (!withinPixelLimit(content)) {
                    log.warn("drawing image skipped for AI: too many pixels or unreadable header, ext={}", ext);
                    return List.of();
                }
                BufferedImage img = ImageIO.read(new ByteArrayInputStream(content));
                return img == null ? List.of() : List.of(png(fit(img)));
            }
        } catch (IOException | RuntimeException e) {
            log.warn("drawing could not be rendered for AI: ext={} reason={}", ext, e.toString());
        }
        return List.of();
    }

    /** 只读文件头拿宽高，不解码像素。读不出宽高的一律当作超限。 */
    private static boolean withinPixelLimit(byte[] content) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(content))) {
            Iterator<ImageReader> readers = in == null ? null : ImageIO.getImageReaders(in);
            if (readers == null || !readers.hasNext()) {
                return false;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                return (long) reader.getWidth(0) * reader.getHeight(0) <= MAX_IMAGE_PIXELS;
            } finally {
                reader.dispose();
            }
        }
    }

    private static List<AiImage> renderPdf(byte[] content, int maxPages) throws IOException {
        try (PDDocument doc = Loader.loadPDF(content)) {
            PDFRenderer renderer = new PDFRenderer(doc);
            int pages = Math.min(doc.getNumberOfPages(), maxPages);
            List<AiImage> out = new ArrayList<>(pages);
            for (int i = 0; i < pages; i++) {
                PDRectangle box = doc.getPage(i).getMediaBox();
                float longSidePt = Math.max(box.getWidth(), box.getHeight());
                float scale = longSidePt <= 0 ? 1f : MAX_SIDE_PX / longSidePt;
                out.add(png(renderer.renderImage(i, scale, ImageType.RGB)));
            }
            return out;
        }
    }

    /** 长边超过上限就等比缩小；不放大。 */
    private static BufferedImage fit(BufferedImage img) {
        int longSide = Math.max(img.getWidth(), img.getHeight());
        if (longSide <= MAX_SIDE_PX) {
            return img;
        }
        int w = Math.max(1, Math.round((float) img.getWidth() * MAX_SIDE_PX / longSide));
        int h = Math.max(1, Math.round((float) img.getHeight() * MAX_SIDE_PX / longSide));
        BufferedImage scaled = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = scaled.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(img, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return scaled;
    }

    private static AiImage png(BufferedImage img) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return new AiImage(PNG, out.toByteArray());
    }

    private static boolean isImage(String ext) {
        return ext.equals("png") || ext.equals("jpg") || ext.equals("jpeg");
    }

    private static String extension(String filename) {
        if (filename == null) return "";
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
