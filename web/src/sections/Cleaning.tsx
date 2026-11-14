import { story } from '../data'
import { Arrow } from '../components/Arrow'
import './Cleaning.css'

const { meta } = story
const count = (n: number) => n.toLocaleString('en-CA')

export default function Cleaning() {
  return (
    <section id="Cleaning" className="cleaning">
      <header className="cleaning-head">
        <h2>Before any of this, we fixed the data.</h2>
        <p className="muted">Every number here comes from the cleaned orders. Below is each problem, how many rows it hit, and what we did.</p>
      </header>

      <div className="cleaning-counts">
        <div>
          <span className="muted">Rows we got</span>
          <strong className="num">{count(meta.rawOrders)}</strong>
        </div>
        <span className="cleaning-arrow" aria-hidden="true">
          <Arrow />
        </span>
        <div>
          <span className="muted">Orders we used</span>
          <strong className="num">{count(meta.cleanOrders)}</strong>
        </div>
        <p className="muted cleaning-note">
          We removed <span className="num">{count(meta.rawOrders - meta.cleanOrders)}</span> rows. Everything else we fixed, not deleted.
        </p>
      </div>

      <ol className="cleaning-list">
        {meta.cleaning.map((c) => (
          <li key={c.issue} className="cleaning-row">
            <span className="cleaning-n num">{count(c.count)}</span>
            <div className="cleaning-body">
              <h3>{c.issue}</h3>
              <p className="muted">{c.why}</p>
            </div>
            <span className="cleaning-fix">{c.fix}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
