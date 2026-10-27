import { HOW_TO_FLOW, HOW_TO_POINTS, HOW_TO_SUMMARY } from "../lib/howTo.js";

export function HowTo() {
  return (
    <section className="howTo" aria-labelledby="how-to-heading">
      <p className="eyebrow">Local desk</p>
      <h2 id="how-to-heading">How to use Personal OS</h2>
      <p className="howToSummary">{HOW_TO_SUMMARY}</p>

      <ol className="howToFlow" aria-label="How Personal OS is meant to be used">
        {HOW_TO_FLOW.map((step, index) => (
          <li key={step.label} className="howToFlowStep">
            <span className="howToFlowIndex" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <ul className="howToPoints">
        {HOW_TO_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  );
}
