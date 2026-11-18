package com.mfg.domain.quote;

import com.mfg.platform.ai.AiImage;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 图纸 → 发给看图模型的图片：PDF 每页一张、限页数、限长边；图片缩放；其他格式不处理。 */
class DrawingImagesTest {

    @Test
    void pdfPagesBecomePngsCappedInCountAndSize() throws IOException {
        List<AiImage> images = DrawingImages.render("a.pdf", pdf(5, PDRectangle.A3), 2);

        assertThat(images).hasSize(2);
        for (AiImage img : images) {
            assertThat(img.mimeType()).isEqualTo("image/png");
            BufferedImage decoded = decode(img.data());
            assertThat(Math.max(decoded.getWidth(), decoded.getHeight())).isLessThanOrEqualTo(DrawingImages.MAX_SIDE_PX);
        }
    }

    @Test
    void largeImageIsScaledDown() throws IOException {
        List<AiImage> images = DrawingImages.render("scan.PNG", png(4000, 3000), 2);

        assertThat(images).hasSize(1);
        BufferedImage decoded = decode(images.get(0).data());
        assertThat(decoded.getWidth()).isEqualTo(DrawingImages.MAX_SIDE_PX);
        assertThat(decoded.getHeight()).isEqualTo(DrawingImages.MAX_SIDE_PX * 3 / 4);
    }

    @Test
    void smallImageKeepsItsSize() throws IOException {
        BufferedImage decoded = decode(DrawingImages.render("s.jpg", png(800, 600), 2).get(0).data());

        assertThat(decoded.getWidth()).isEqualTo(800);
    }

    /** 像素极多的图片解码一次就要上 GB 内存：先读尺寸，超过上限的不解码。 */
    @Test
    void hugeImageIsSkippedWithoutBeingDecoded() throws IOException {
        // 1 位色深，8000 × 8000 = 6400 万像素，文件和测试内存都很小，但解成 RGB 要 190 MB
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8000, 8000, BufferedImage.TYPE_BYTE_BINARY), "png", out);

        assertThat((long) 8000 * 8000).isGreaterThan(DrawingImages.MAX_IMAGE_PIXELS);
        assertThat(DrawingImages.render("huge.png", out.toByteArray(), 2)).isEmpty();
    }

    @Test
    void unsupportedTypesAreNotRendered() {
        assertThat(DrawingImages.supports("part.step")).isFalse();
        assertThat(DrawingImages.supports("part.PDF")).isTrue();
        assertThat(DrawingImages.render("part.step", new byte[]{1, 2, 3}, 2)).isEmpty();
    }

    @Test
    void brokenFileYieldsNoImagesInsteadOfThrowing() {
        assertThat(DrawingImages.render("bad.pdf", new byte[]{1, 2, 3}, 2)).isEmpty();
        assertThat(DrawingImages.render("bad.png", new byte[]{1, 2, 3}, 2)).isEmpty();
    }

    private static byte[] pdf(int pages, PDRectangle size) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(size));
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] png(int w, int h) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    private static BufferedImage decode(byte[] data) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(data));
    }
}
