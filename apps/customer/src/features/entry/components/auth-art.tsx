import { Fragment, type CSSProperties } from "react";
import { Icon, type IconName } from "@/ui";
import styles from "./auth-art.module.css";

/** The approved homepage headline, shown word by word (CLAUDE.md: approved copy is locked). */
export const AUTH_HEADLINE = "Before They Visit You, They Visit Your Website.";

const CHIPS: readonly { readonly label: string; readonly icon: IconName; readonly className: string | undefined }[] = [
  { label: "Your website", icon: "Globe", className: styles.site },
  { label: "Your posts and ads", icon: "InstagramLogo", className: styles.social },
  { label: "Found on Google", icon: "MapPin", className: styles.search },
];

/**
 * The Pin drop panel beside every entry form: a town map, a pin that drops onto it, rings that pulse out, the three
 * services settling around it, then the headline. Decoration only, so it is hidden from screen readers.
 */
export function AuthArt() {
  return (
    <section className={styles.art} aria-hidden="true">
      <svg className={styles.map} viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice">
        <path className={styles.water} d="M-20 640 C 180 600 260 700 420 660 S 700 560 820 600 L 820 700 C 700 660 560 760 420 760 S 160 700 -20 740 Z" />
        <rect className={styles.block} x="90" y="120" width="170" height="120" rx="14" />
        <rect className={styles.block} x="300" y="90" width="210" height="150" rx="14" />
        <rect className={styles.block} x="560" y="140" width="190" height="110" rx="14" />
        <rect className={styles.block} x="70" y="300" width="230" height="160" rx="14" />
        <rect className={styles.park} x="560" y="310" width="200" height="190" rx="14" />
        <rect className={styles.block} x="330" y="470" width="190" height="110" rx="14" />
        <path className={styles.road} strokeWidth="26" d="M-20 270 H 820" />
        <path className={styles.road} strokeWidth="22" d="M530 -20 V 920" />
        <path className={styles.road} strokeWidth="18" d="M290 -20 C 300 300 310 380 300 920" />
        <path className={styles.road} strokeWidth="16" d="M-20 520 C 200 500 420 540 820 520" />
        <path className={styles.road} strokeWidth="10" d="M60 -20 L 210 920" />
      </svg>
      <div className={styles.ring} />
      <div className={styles.ring} />
      <div className={styles.ring} />
      <div className={styles.shadow} />
      <div className={styles.pin} />
      {CHIPS.map((chip) => (
        <div key={chip.label} className={`${styles.chip} ${chip.className ?? ""}`}>
          <span className={styles.chipIcon}>
            <Icon name={chip.icon} />
          </span>
          {chip.label}
        </div>
      ))}
      <p className={styles.headline}>
        {AUTH_HEADLINE.split(" ").map((word, index) => (
          // The space sits outside the word: inside an inline-block it would collapse.
          <Fragment key={`${word}-${index}`}>
            <span className={styles.word} style={{ "--i": index } as CSSProperties}>
              {word}
            </span>{" "}
          </Fragment>
        ))}
      </p>
    </section>
  );
}
