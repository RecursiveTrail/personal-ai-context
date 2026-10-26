import { HOW_TO_SECTIONS } from "../lib/howTo.js";
import { INSTALL_STEPS } from "../lib/pluginFiles.js";

export function HowTo() {
  return (
    <section className="howTo" aria-labelledby="how-to-heading">
      <p className="eyebrow">Local desk</p>
      <h2 id="how-to-heading">How to use Personal OS</h2>
      <p>Follow these steps in this browser. Notes stay on this device.</p>
      {HOW_TO_SECTIONS.map((section) => (
        <article key={section.title}>
          <h3>{section.title}</h3>
          <ol>
            {section.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      ))}
      <article>
        <h3>Install the downloaded plugin</h3>
        <ol>
          {INSTALL_STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}.</strong> {step.body}
            </li>
          ))}
        </ol>
      </article>
    </section>
  );
}
