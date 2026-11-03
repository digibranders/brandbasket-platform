import styles from "./auth-art.module.css";

/** The launch path from the Home page, in an owner's words: what happens after sign-up, ending with the website live. */
export const LAUNCH_STEPS = ["Sign up.", "Book your call.", "Send your details.", "We build your website.", "You review it.", "It goes live."] as const;

/**
 * The panel beside every entry form, carried over from the old app: the launch path as large lines that take turns
 * lighting up (auth-art.module.css), then the promise under them. Decoration only, so it is hidden from screen readers.
 * Phones do not get it.
 */
export function AuthArt() {
  return (
    <section className={styles.art} aria-hidden="true">
      <ol className={styles.steps}>
        {LAUNCH_STEPS.map((step) => (
          <li key={step} className={styles.line}>
            {step}
          </li>
        ))}
      </ol>
      <p className={styles.promise}>Then we look after it, every month.</p>
    </section>
  );
}
