import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { teleponsLinks } from "@/config/links";

export const metadata: Metadata = {
  title: "Documentation — Telepons",
  description:
    "Set up Telepons, prepare a token launch, verify members, and operate BuyBot from Telegram.",
};

const sections = [
  ["overview", "Overview"],
  ["official-links", "Official links"],
  ["requirements", "Requirements"],
  ["quick-start", "Quick start"],
  ["community-setup", "Community setup"],
  ["moderation", "Moderation"],
  ["launch", "Token launch"],
  ["wallet", "Wallet execution"],
  ["buybot", "BuyBot"],
  ["trending", "Trending"],
  ["commands", "Commands"],
  ["security", "Security"],
  ["troubleshooting", "Troubleshooting"],
] as const;

function Command({ children }: { children: string }) {
  return <code className="docs-command">{children}</code>;
}

export default function DocsPage() {
  return (
    <main className="docs-page">
      <nav className="docs-topbar" aria-label="Documentation navigation">
        <Link className="wordmark" href="/" aria-label="Telepons home">
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
        </Link>
        <div className="docs-topbar-links">
          <Link href="/">Home</Link>
          <a href={teleponsLinks.launchList}>Launch list</a>
        </div>
      </nav>

      <div className="docs-layout">
        <aside className="docs-sidebar">
          <p>DOCUMENTATION</p>
          <nav aria-label="On this page">
            {sections.map(([id, label]) => (
              <a href={`#${id}`} key={id}>
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="docs-content">
          <header className="docs-hero" id="overview">
            <p className="eyebrow">TELEPONS DOCUMENTATION</p>
            <h1>Launch and operate your token community from Telegram.</h1>
            <p>
              Telepons helps a Telegram group owner configure community
              onboarding, prepare token metadata, approve a non-custodial Pons
              launch, and activate BuyBot after the transaction is verified
              onchain.
            </p>
            <div className="docs-status-row">
              <span>Robinhood Chain</span>
              <span>Owner controlled</span>
              <span>Non-custodial</span>
            </div>
          </header>

          <section className="docs-section" id="official-links">
            <p className="docs-section-index">OFFICIAL</p>
            <h2>Official Telepons links</h2>
            <div className="official-link-grid">
              <a href={teleponsLinks.telegramBot}>
                <span>TELEGRAM BOT</span>
                <strong>@teleponsBot</strong>
              </a>
              <a href={teleponsLinks.announcementChannel}>
                <span>OFFICIAL CHANNEL</span>
                <strong>@TeleponsAnnouncement</strong>
              </a>
              <a href={teleponsLinks.launchList}>
                <span>LAUNCH LIST</span>
                <strong>@teleponslaunchlist</strong>
              </a>
              {teleponsLinks.x ? (
                <a href={teleponsLinks.x}>
                  <span>X / TWITTER</span>
                  <strong>Official Telepons X</strong>
                </a>
              ) : (
                <div>
                  <span>X / TWITTER</span>
                  <strong>Coming soon</strong>
                </div>
              )}
            </div>
          </section>

          <section className="docs-section" id="requirements">
            <p className="docs-section-index">01</p>
            <h2>Requirements</h2>
            <p>Before setup, make sure the following conditions are met:</p>
            <ul>
              <li>You are the Telegram group owner.</li>
              <li>The group has a public username and public Telegram URL.</li>
              <li>Telepons is added to the group as an administrator.</li>
              <li>
                Telepons has the <strong>Restrict Members</strong> permission.
              </li>
              <li>
                The group owner subscribes to <code>@teleponslaunchlist</code>
                and <code>@TeleponsAnnouncement</code>.
              </li>
            </ul>
            <div className="docs-note">
              Telepons checks both required channel subscriptions directly
              against Telegram on every protected action.
            </div>
          </section>

          <section className="docs-section" id="quick-start">
            <p className="docs-section-index">02</p>
            <h2>Quick start</h2>
            <ol className="docs-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>Add Telepons to the group</strong>
                  <p>Promote the bot and enable Restrict Members.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Configure the community</strong>
                  <p>Run <Command>/setup</Command> as the group owner.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Prepare the token</strong>
                  <p>Run <Command>/launch</Command> and provide the token logo.</p>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>Approve from the deployer wallet</strong>
                  <p>Open the generated launch terminal and sign the transaction.</p>
                </div>
              </li>
              <li>
                <span>5</span>
                <div>
                  <strong>Go live</strong>
                  <p>Telepons verifies the launch and activates BuyBot.</p>
                </div>
              </li>
            </ol>
          </section>

          <section className="docs-section" id="community-setup">
            <p className="docs-section-index">03</p>
            <h2>Community setup</h2>
            <p>
              Run <Command>/setup</Command> in the group. Only the current group
              owner can complete this flow.
            </p>
            <h3>Default member permissions</h3>
            <p>
              Setup changes the group&apos;s default member permissions to text
              messages only. Media, files, polls, stickers, link previews,
              invitations, pins, and group-info changes are disabled for normal
              members. Telegram administrators remain unaffected.
            </p>
            <h3>Group description and welcome message</h3>
            <p>
              Telepons asks for a 10–1,000 character group description, followed
              by the owner&apos;s welcome-message idea. The LLM formats that input
              into a consistent plain-text welcome message without inventing
              links, promises, token facts, or investment claims.
            </p>
            <p>
              The setup conversation expires after 30 minutes. The description
              is stored by Telepons as community context; it does not overwrite
              the Telegram group&apos;s public About field.
            </p>
          </section>

          <section className="docs-section" id="moderation">
            <p className="docs-section-index">04</p>
            <h2>Welcome, verification, and anti-flood</h2>
            <p>
              Moderation is enabled by default. A new human member is muted and
              receives a five-minute Verify Human button. The button first opens
              a private chat with Telepons, where Telegram identifies the user
              who started verification. Only the member named in the original
              request receives the private web challenge link.
            </p>
            <ul>
              <li>A copied group verification link cannot be claimed by another user.</li>
              <li>The public deep-link token cannot open the web challenge directly.</li>
              <li>Five incorrect verification attempts are allowed.</li>
              <li>Messages from pending members are removed.</li>
              <li>Telegram join service messages are removed automatically.</li>
              <li>Expired members remain in the group in a muted state.</li>
              <li>An expired member&apos;s verification prompt is removed.</li>
              <li>Only the latest successful member welcome remains visible.</li>
              <li>Bot accounts are detected and recorded.</li>
              <li>Moderation actions are recorded in the database.</li>
            </ul>
            <h3>Anti-flood defaults</h3>
            <div className="docs-data-grid">
              <div><span>Threshold</span><strong>5 messages</strong></div>
              <div><span>Window</span><strong>10 seconds</strong></div>
              <div><span>Mute</span><strong>60 seconds</strong></div>
            </div>
            <p>
              Administrators are exempt. Use <Command>/moderation on</Command> or
              <Command>/moderation off</Command> to control welcome messages,
              verification, and anti-flood together.
            </p>
          </section>

          <section className="docs-section" id="launch">
            <p className="docs-section-index">05</p>
            <h2>Prepare a token launch</h2>
            <h3>Guided mode</h3>
            <p>
              Send <Command>/launch</Command> by itself. Telepons asks for the
              token name, symbol, description, deployer address, developer buy,
              X account, website, and logo one step at a time.
            </p>
            <h3>Direct mode</h3>
            <p>Supply complete details in the command:</p>
            <pre className="docs-code"><code>{`/launch Name: Example Token
Symbol: EXAMPLE
Description: Community token on Robinhood Chain
Deployer: 0x...
Developer Buy: 0.1
Twitter: @example
Website: https://example.com`}</code></pre>
            <p>
              Telepons extracts the fields with structured LLM function calling
              and then asks for the logo. Alternatively, send the logo with all
              token details in its Telegram caption.
            </p>
            <h3>Logo storage</h3>
            <p>
              PNG, JPEG, and WebP images up to 5 MB are accepted. Telepons
              downloads the Telegram file, uploads it to Pinata, stores its IPFS
              CID, and uses the image for the launch and BuyBot.
            </p>
            <h3>Confirmation and expiration</h3>
            <p>
              The owner reviews and confirms the frozen launch order. The final
              wallet-execution session expires after 10 minutes. An existing
              active session can be continued or replaced; an expired session
              cannot reuse its old draft.
            </p>
          </section>

          <section className="docs-section" id="wallet">
            <p className="docs-section-index">06</p>
            <h2>Wallet execution</h2>
            <p>
              The launch link opens the Telepons website. Connect the exact EVM
              deployer wallet configured in Telegram. Telepons can use Reown for
              mobile selection or an injected wallet inside a wallet browser.
            </p>
            <p>The website then:</p>
            <ol>
              <li>Matches the connected address with the expected deployer.</li>
              <li>Switches to Robinhood Chain.</li>
              <li>Finds an enabled Pons launch configuration.</li>
              <li>Reads the current launch fee and simulates the call.</li>
              <li>Requests the launch transaction signature.</li>
            </ol>
            <p>
              The backend independently verifies the sender, factory, calldata,
              metadata, ETH value, receipt, and <code>TokenLaunched</code> event.
              Telepons never receives or stores the deployer&apos;s private key.
            </p>
          </section>

          <section className="docs-section" id="buybot">
            <p className="docs-section-index">07</p>
            <h2>BuyBot and volume tracking</h2>
            <p>
              After a verified launch, BuyBot starts automatically. It reads
              canonical pool Swap events and publishes qualifying buys with the
              spent ETH, tokens received, explorer-linked buyer, current holding
              percentage, accumulated volume, and transaction link.
            </p>
            <p>
              Volume is calculated from the same indexed swaps—there is no
              separate duplicate volume fetch. Events are deduplicated and pool
              checkpoints are stored in PostgreSQL. If no BuyBot is active, the
              indexer performs no Robinhood Chain RPC work.
            </p>
            <div className="docs-note">
              BuyBot test mode is disabled. A group monitors only the token that
              was successfully launched through its active Telepons session.
            </div>
          </section>

          <section className="docs-section" id="trending">
            <p className="docs-section-index">08</p>
            <h2>Trending leaderboard</h2>
            <p>
              Trending ranks eligible Telepons tokens by gross ETH trading
              volume over 1 hour, 6 hours, 24 hours, or 7 days. A token needs at
              least five indexed trades from two unique traders to appear.
            </p>
            <p>
              Open the public leaderboard at <Link href="/trending">/trending</Link>.
              It refreshes every 30 seconds and uses the same data provider as
              the Telegram command.
            </p>
            <p>
              Dummy mode generates isolated demonstration entries and is always
              labelled DEMO DATA. On-chain mode reads the verified Swap records
              already collected by BuyBot, so it performs no duplicate RPC
              fetching and never mixes demo rows into production volume. The
              first on-chain activation time is persisted, excluding all volume
              collected during the earlier dummy-testing phase.
            </p>
          </section>

          <section className="docs-section" id="commands">
            <p className="docs-section-index">09</p>
            <h2>Command reference</h2>
            <div className="docs-command-table">
              <div><Command>/start</Command><p>Display the initial bot instructions.</p></div>
              <div><Command>/setup</Command><p>Configure permissions, description, and welcome message.</p></div>
              <div><Command>/launch</Command><p>Start the guided token setup.</p></div>
              <div><Command>/launch details…</Command><p>Process complete token details directly.</p></div>
              <div><Command>/buybot</Command><p>Display current BuyBot settings.</p></div>
              <div><Command>/buybot on</Command><p>Enable BuyBot notifications.</p></div>
              <div><Command>/buybot off</Command><p>Pause BuyBot notifications and RPC indexing for the group.</p></div>
              <div><Command>/buybot 0.05</Command><p>Set the minimum displayed buy in ETH.</p></div>
              <div><Command>/buybot image</Command><p>Request a custom BuyBot image upload.</p></div>
              <div><Command>/buybot image reset</Command><p>Return to the original token logo.</p></div>
              <div><Command>/trending</Command><p>Display the 24-hour volume leaderboard.</p></div>
              <div><Command>/trending 1h</Command><p>Open a specific 1H, 6H, 24H, or 7D leaderboard.</p></div>
              <div><Command>/moderation</Command><p>Display moderation status and thresholds.</p></div>
              <div><Command>/moderation on</Command><p>Enable welcome, verification, and anti-flood.</p></div>
              <div><Command>/moderation off</Command><p>Disable all three moderation features.</p></div>
            </div>
          </section>

          <section className="docs-section" id="security">
            <p className="docs-section-index">10</p>
            <h2>Security model</h2>
            <ul>
              <li>Only the current group owner can configure or launch.</li>
              <li>Launch metadata is frozen before the session link is created.</li>
              <li>The connected wallet must match the configured deployer.</li>
              <li>Every successful launch is verified from blockchain data.</li>
              <li>Session identifiers are random, expiring, and single-use.</li>
              <li>No Telegram Login URL or SIWE signature is required.</li>
              <li>The backend never stores private keys.</li>
              <li>RPC traffic is limited to five requests per second.</li>
            </ul>
          </section>

          <section className="docs-section" id="troubleshooting">
            <p className="docs-section-index">11</p>
            <h2>Troubleshooting</h2>
            <div className="docs-faq">
              <details>
                <summary>The bot refuses to run setup</summary>
                <p>
                  Confirm that you are the Telegram group owner, the bot is an
                  administrator with Restrict Members, and your account follows
                  both required Telepons channels.
                </p>
              </details>
              <details>
                <summary>The launch command says the group is private</summary>
                <p>
                  Assign a public username to the Telegram group. Private invite
                  links are not accepted as token community metadata.
                </p>
              </details>
              <details>
                <summary>The connected wallet does not match</summary>
                <p>
                  Switch to the exact deployer address entered during token
                  setup. Changing the wallet does not change the frozen session.
                </p>
              </details>
              <details>
                <summary>The launch session expired</summary>
                <p>
                  Return to Telegram and run /launch again. Expired launch
                  sessions cannot be reopened for execution.
                </p>
              </details>
              <details>
                <summary>A new member is not being muted</summary>
                <p>
                  Enable moderation and confirm that Telepons still has Restrict
                  Members. Telegram must also deliver chat-member updates to the
                  bot.
                </p>
              </details>
            </div>
          </section>

          <footer className="docs-footer">
            <Image
              alt="Telepons"
              height={38}
              src="/brand/telepons-mark.png"
              width={38}
            />
            <div>
              <strong>Telepons</strong>
              <p>Community launch infrastructure for Robinhood Chain.</p>
            </div>
          </footer>
        </article>
      </div>
    </main>
  );
}
