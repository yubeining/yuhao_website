import { Link } from 'react-router-dom'

export function NotFoundPage() {
    return (
        <div className="signin">
            <div className="signin__card">
                <h1>404</h1>
                <p className="signin__sub">这个地址没有对应的页面。</p>
                <Link to="/">回首页</Link>
            </div>
        </div>
    )
}
