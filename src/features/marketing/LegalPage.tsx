type LegalSection = {
  id: string;
  title: string;
  body: string;
};

export const LegalPage = (props: {
  eyebrow: string;
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
}) => (
  <main className="px-3 py-16">
    <article className="
      mx-auto max-w-4xl rounded-2xl border border-cyan-500/20 bg-background/88
      p-6 shadow-[0_24px_80px_oklch(0.42_0.08_215/10%)] backdrop-blur-sm
      md:p-10
    "
    >
      <div className="text-sm font-bold text-cyan-700">{props.eyebrow}</div>
      <h1 className="mt-2 text-4xl font-bold tracking-normal">
        {props.title}
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {props.description}
      </p>
      <p className="mt-3 text-sm font-medium text-muted-foreground">
        {props.updated}
      </p>

      <div className="mt-10 space-y-7">
        {props.sections.map(section => (
          <section key={section.id}>
            <h2 className="text-xl font-bold">{section.title}</h2>
            <p className="mt-2 text-sm/7 text-muted-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </article>
  </main>
);
