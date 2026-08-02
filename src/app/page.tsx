import Image from "next/image";
import Link from "next/link";
import { teleponsLinks } from "@/config/links";

export default function Home() {
  return (
    <main className="landing-page">
      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark" href="#top" aria-label="Telepons home">
          <span className="brand-mark">
            <Image
              alt=""
              height={32}
              priority
              src="/brand/telepons-mark.png"
              width={32}
            />
          </span>
          telepons
        </a>
        <div className="nav-links">
          <Link href="/trending">Trending</Link>
          <Link href="/docs">Docs</Link>
          <a href="#workflow">How it works</a>
          <a href="#intelligence">Intelligence</a>
          <a className="nav-cta" href={teleponsLinks.launchList}>
            Launch list
          </a>
        </div>
      </nav>

      <section className="hero-section" id="top">
        <div className="hero-copy">
          <div className="hero-badge">
            <span className="dot" />
            Built for Robinhood Chain
          </div>
          <h1 className="hero-title">
            Your community.
            <br />
            <span>Your launch terminal.</span>
          </h1>
          <p className="hero-description">
            Create token details with your Telegram bot, approve the exact
            launch from the deployer wallet, and turn the same group into a
            real-time onchain command center.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#workflow">
              See the launch flow
              <span aria-hidden="true">→</span>
            </a>
            <a
              className="button button-secondary"
              href={teleponsLinks.launchList}
            >
              View upcoming launches
            </a>
          </div>
          <div className="trust-row" aria-label="Product guarantees">
            <span>Non-custodial</span>
            <span>Owner controlled</span>
            <span>Onchain verified</span>
          </div>
        </div>

        <div className="terminal-wrap" aria-label="Telepons launch preview">
          <div className="terminal-glow" />
          <article className="product-terminal">
            <header className="terminal-header">
              <div>
                <p className="terminal-kicker">LAUNCH SESSION</p>
                <p className="terminal-id">session_7F2A</p>
              </div>
              <div className="terminal-status">
                <span className="status-pulse" />
                READY
              </div>
            </header>
            <div className="token-preview">
              <div className="mock-token-logo">
                <Image
                  alt="Telepons"
                  height={48}
                  src="/brand/telepons-mark.png"
                  width={48}
                />
              </div>
              <div>
                <p className="mock-token-name">Telepons Protocol</p>
                <p className="mock-token-symbol">$TELE</p>
              </div>
              <div className="countdown-chip">
                <span>EXECUTION WINDOW</span>
                08:42
              </div>
            </div>
            <div className="terminal-details">
              <div>
                <span>DEPLOYER</span>
                <strong>0x71A4…82FC</strong>
              </div>
              <div>
                <span>DEVELOPER BUY</span>
                <strong>0.20 ETH</strong>
              </div>
              <div>
                <span>NETWORK</span>
                <strong>Robinhood Chain</strong>
              </div>
              <div>
                <span>AUTHORITY</span>
                <strong>Group owner</strong>
              </div>
            </div>
            <div className="terminal-verification">
              <span className="verification-icon">✓</span>
              <div>
                <strong>Deployer wallet matched</strong>
                <p>Transaction parameters are frozen and ready to simulate.</p>
              </div>
            </div>
            <div className="mock-action">Simulate launch</div>
          </article>
          <div className="floating-note note-one">
            <span>01</span>
            Telegram verified
          </div>
          <div className="floating-note note-two">
            <span>02</span>
            Wallet signed
          </div>
        </div>
      </section>

      <section className="proof-strip">
        <p>ONE CONTINUOUS LAUNCH EXPERIENCE</p>
        <div>
          <span>Telegram setup</span>
          <i>→</i>
          <span>Wallet approval</span>
          <i>→</i>
          <span>Onchain launch</span>
          <i>→</i>
          <span>Community intelligence</span>
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading">
          <p className="eyebrow">FROM PROMPT TO POOL</p>
          <h2>Launch without leaving your community behind.</h2>
          <p>
            Telepons keeps configuration, authorization, execution, and
            post-launch activity connected to the group where the token began.
          </p>
        </div>
        <div className="workflow-grid">
          <article className="workflow-card featured-step">
            <span className="step-number">01</span>
            <div className="mini-chat">
              <div className="chat-line">
                <span className="chat-avatar">O</span>
                <p>
                  <strong>Group owner</strong>
                  Logo + complete token details
                </p>
              </div>
              <div className="chat-reply">
                <span>TELEPONS</span>
                Launch order ready for confirmation.
              </div>
            </div>
            <h3>Configure in Telegram</h3>
            <p>
              The verified group owner sends one launch order with the logo and
              complete token details. The community link is attached
              automatically.
            </p>
          </article>
          <article className="workflow-card">
            <span className="step-number">02</span>
            <div className="step-visual wallet-visual">
              <span className="visual-label">EXPECTED DEPLOYER</span>
              <strong>0x71A4…82FC</strong>
              <div className="match-line">
                <i>✓</i> Exact wallet match
              </div>
            </div>
            <h3>Approve with the deployer</h3>
            <p>
              A private, expiring link opens the launch terminal. Only the
              configured EVM wallet can simulate and sign the transaction.
            </p>
          </article>
          <article className="workflow-card">
            <span className="step-number">03</span>
            <div className="step-visual chain-visual">
              <div><span>PONS FACTORY</span><strong>Verified</strong></div>
              <div><span>EVENT</span><strong>TokenLaunched</strong></div>
              <div><span>STATUS</span><strong className="green-text">Active</strong></div>
            </div>
            <h3>Verify onchain</h3>
            <p>
              The backend validates the sender, factory, calldata, value,
              receipt, and launch event before activating the token.
            </p>
          </article>
        </div>
      </section>

      <section className="intelligence-section" id="intelligence">
        <div className="intelligence-panel">
          <div className="intelligence-copy">
            <p className="eyebrow">AFTER THE LAUNCH</p>
            <h2>The launch bot becomes the intelligence layer.</h2>
            <p>
              The same group that prepared the token receives verified activity
              from the pool and token contracts—without trusting a separate
              dashboard as the source of truth.
            </p>
            <ul className="feature-list">
              <li><span>↗</span> BuyBot and live volume</li>
              <li><span>◎</span> Holder balances and concentration</li>
              <li><span>◇</span> Smart-wallet classification</li>
              <li><span>◉</span> Public launch-list status</li>
            </ul>
          </div>
          <div className="metrics-terminal">
            <header>
              <div>
                <span className="status-pulse" />
                TELE LIVE TERMINAL
              </div>
              <small>12s ago</small>
            </header>
            <div className="price-row">
              <div>
                <span>MARKET CAP</span>
                <strong>$86,421</strong>
              </div>
              <div className="price-change">+18.4%</div>
            </div>
            <div className="metrics-grid">
              <div><span>VOLUME 1H</span><strong>12.84 ETH</strong></div>
              <div><span>NET FLOW</span><strong className="green-text">+4.18 ETH</strong></div>
              <div><span>HOLDERS</span><strong>1,428</strong></div>
              <div><span>SMART WALLETS</span><strong>19</strong></div>
            </div>
            <div className="activity-line">
              <span className="buy-pill">BUY</span>
              <strong>0.42 ETH</strong>
              <span>0x81A…B42</span>
              <small>just now</small>
            </div>
          </div>
        </div>
      </section>

      <section className="principles-section">
        <div className="section-heading compact-heading">
          <p className="eyebrow">DESIGNED FOR TRUST</p>
          <h2>AI assists. The owner authorizes. The chain confirms.</h2>
        </div>
        <div className="principles-grid">
          <article>
            <span>01</span>
            <h3>No private keys</h3>
            <p>The backend never stores or handles the deployer’s signing key.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Frozen launch order</h3>
            <p>Confirmed metadata is hashed and bound to one expiring session.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Onchain source of truth</h3>
            <p>A launch is active only after the verified factory event exists.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Owner-only control</h3>
            <p>Group messages never reach the assistant unless the owner is drafting.</p>
          </article>
        </div>
      </section>

      <section className="final-cta">
        <div>
          <p className="eyebrow">READY WHEN YOUR COMMUNITY IS</p>
          <h2>Start in Telegram. Launch onchain.</h2>
          <p>
            Add Telepons to your group, promote it to administrator, and let
            the verified owner run the launch.
          </p>
        </div>
        <a className="button button-primary" href={teleponsLinks.launchList}>
          Explore launch list <span>→</span>
        </a>
      </section>

      <footer className="site-footer">
        <a className="wordmark" href="#top">
          <span className="brand-mark">
            <Image
              alt=""
              height={32}
              src="/brand/telepons-mark.png"
              width={32}
            />
          </span>
          telepons
        </a>
        <div className="site-footer-links" aria-label="Official Telepons links">
          <a href={teleponsLinks.telegramBot}>Telegram bot</a>
          <a href={teleponsLinks.announcementChannel}>Official channel</a>
          <a href={teleponsLinks.launchList}>Launch list</a>
          {teleponsLinks.x ? <a href={teleponsLinks.x}>X / Twitter</a> : null}
        </div>
        <span>Non-custodial by design.</span>
      </footer>
    </main>
  );
}
