import { INSTALL_STEPS } from "../lib/pluginFiles.js";

export function InstallGuide() {
  return (
    <section className="installGuide">
      <h2>Install your plugin</h2>
      <p>Unzip the download, then use the folder in the assistant you want. This page does not install it for you.</p>
      {INSTALL_STEPS.map((step) => (
        <article key={step.title}>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </article>
      ))}
    </section>
  );
}
