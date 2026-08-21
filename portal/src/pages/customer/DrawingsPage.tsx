/**
 * 图纸库。
 *
 * ★「导出访问记录」不是装饰按钮 —— 每一次图纸访问都要留审计（谁 / 何时 /
 *   哪个版本 / 来源 IP），而且必须能一键导出。欧洲客户会问这个问题，
 *   答不上来就没有下一步。后端那侧见 CLAUDE.md §3 铁律 6。
 */

import { Card, CardBody, Empty, Hello, Page, Pill, TableWrap } from '../../components/ui'
import { useMock } from '../../mock/MockProvider'
import { myRfqs } from '../../mock/selectors'

export function DrawingsPage() {
    const { state } = useMock()
    const rows = myRfqs(state).flatMap((r) => r.lines.map((l) => ({ r, l })))

    return (
        <Page>
            <Hello title="图纸库" right={<button className="btn" type="button">导出访问记录</button>} />
            <Card>
                {rows.length ? (
                    <CardBody flush>
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>零件</th><th>版本</th><th>材料</th><th>关联询价</th><th className="n">上传</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(({ r, l }, i) => (
                                    <tr className="clk" key={`${r.id}-${i}`}>
                                        <td className="t1">{l.no}</td>
                                        <td><Pill tone="ne" dot={false}>Rev {l.rev}</Pill></td>
                                        <td>{l.mat}</td>
                                        <td><span className="m">{r.id}</span></td>
                                        <td className="n">{r.at.slice(0, 10)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    </CardBody>
                ) : (
                    <CardBody><Empty text="还没有上传过图纸" /></CardBody>
                )}
            </Card>
        </Page>
    )
}
