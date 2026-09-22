import { Link } from 'react-router-dom'
import Navbar from '../../components/customer/Navbar'

// Scoped to the home page (every class is prefixed `home-`) and kept here
// rather than in a global stylesheet. Colors use light-dark() so the hero
// follows the app's existing `color-scheme: light dark` setting.
const homeStyles = `
  .home-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    min-height: 70vh;
    padding: 64px 16px;
    text-align: center;
  }

  .home-hero-eyebrow {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .home-hero-title {
    margin: 0;
    font-size: clamp(3rem, 12vw, 6.5rem);
    font-weight: 300;
    letter-spacing: 0.25em;
    /* Offsets the trailing letter-spacing so the word looks centered. */
    padding-left: 0.25em;
    line-height: 1;
  }

  .home-hero-tagline {
    margin: 0;
    max-width: 32rem;
    font-size: clamp(1rem, 2.5vw, 1.25rem);
    line-height: 1.6;
    opacity: 0.75;
  }

  .home-hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 12px;
  }

  .home-hero-button {
    display: inline-block;
    padding: 14px 32px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    font-size: 0.9rem;
    letter-spacing: 0.15em;
    text-decoration: none;
    text-transform: uppercase;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .home-hero-button-primary {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .home-hero-button-primary:hover {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  .home-hero-button-secondary {
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
  }

  .home-hero-button-secondary:hover {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }
`

function Home() {
  return (
    <>
      <Navbar />
      <style>{homeStyles}</style>
      <main>
        <section className="home-hero">
          <p className="home-hero-eyebrow">New Season</p>
          <h1 className="home-hero-title">NOSTRA</h1>
          <p className="home-hero-tagline">
            Timeless pieces, modern silhouettes. Effortless style for every day.
          </p>

          <div className="home-hero-actions">
            <Link to="/products" className="home-hero-button home-hero-button-primary">
              Shop Now
            </Link>
            <Link to="/products" className="home-hero-button home-hero-button-secondary">
              Explore Collection
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}

export default Home
