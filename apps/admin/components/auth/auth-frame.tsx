import type { ReactElement, ReactNode } from "react";
import { ArrowUpRight, Asterisk, Browser, LockKey, MagnifyingGlass, Megaphone } from "@phosphor-icons/react/dist/ssr";
import { WordmarkLogo } from "@brandbasket/shared/ui/logo";
import { adminBrand } from "@/lib/brand";
import { serverEnv } from "@/lib/server/env";

interface AuthFrameProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

/** The staff entry point: a brand composition and a quiet, focused form. */
export function AuthFrame({ title, description, children }: AuthFrameProps): ReactElement {
  const brand = adminBrand();
  return (
    <div className="console-auth console-motion">
      <aside className="auth-brand-panel" aria-label="Brandbasket console">
        <header className="auth-brand-header">
          <WordmarkLogo href="/login" brand={brand.logo} />
          <span className="auth-console-label">Staff console</span>
        </header>
        <div className="auth-brand-story">
          <h2>Good work.<br /><span>All in one place.</span></h2>
          <p>A home for the people behind every<br className="hidden xl:block" /> Brandbasket business.</p>
        </div>
        <div className="auth-art" aria-hidden="true">
          <div className="auth-art-orbit" />
          <div className="auth-basket-handle" />
          <div className="auth-basket">
            {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
          </div>
          <div className="auth-service auth-service-site"><Browser size={22} weight="regular" /><span>Websites</span><ArrowUpRight size={16} /></div>
          <div className="auth-service auth-service-social"><Megaphone size={22} weight="regular" /><span>Social &amp; ads</span><ArrowUpRight size={16} /></div>
          <div className="auth-service auth-service-search"><MagnifyingGlass size={22} weight="regular" /><span>Local search</span><ArrowUpRight size={16} /></div>
          <Asterisk className="auth-art-spark auth-art-spark-one" weight="light" />
          <Asterisk className="auth-art-spark auth-art-spark-two" weight="light" />
        </div>
        <footer className="auth-brand-footer"><span>Built around better business.</span><span>Brandbasket</span></footer>
      </aside>
      <main id="main" className="auth-form-panel">
        <div className="auth-form-top"><LockKey size={16} aria-hidden="true" /><span>Your team workspace</span></div>
        <div className="auth-form-content">
          <span className="auth-eyebrow"><span />Team access</span>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          <div className="auth-form-body">{children}</div>
        </div>
        <footer className="auth-form-footer">For the Brandbasket team. <a href={new URL("/login", serverEnv().APP_ORIGIN).toString()}>Customer sign-in <ArrowUpRight size={13} aria-hidden="true" /></a></footer>
      </main>
    </div>
  );
}
