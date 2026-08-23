/**
 * The workflow, as a ribbon.
 *
 * This used to be a full marketing section with four cards and four paragraphs.
 * Every one of those four steps has a section of its own further down the page,
 * so at full length it was the table of contents pretending to be a chapter.
 *
 * One line, four beats, scannable in about a second — and it sits between the
 * editor and the Library because those are the two steps a visitor has just seen
 * and is about to see, so the ribbon is what connects them.
 */
const STEPS = [
  { index: '01', title: 'Chọn học liệu', actor: 'Giáo viên', href: '#thu-vien' },
  { index: '02', title: 'Biên soạn', actor: 'Giáo viên', href: '#cong-cu' },
  { index: '03', title: 'Giao bài', actor: 'Lớp học', href: null },
  { index: '04', title: 'Học sinh tương tác', actor: 'Học sinh', href: '#kham-pha' },
];

export function WorkflowRibbon() {
  return (
    <section className="workflow-ribbon" id="quy-trinh" aria-label="Quy trình một bài học YooLab">
      <div className="shell-editorial">
        <ol className="ribbon" data-reveal>
          {STEPS.map((step, index) => (
            <li key={step.index}>
              {step.href
                ? <a href={step.href}><span>{step.index}</span><b>{step.title}</b><em>{step.actor}</em></a>
                : <div><span>{step.index}</span><b>{step.title}</b><em>{step.actor}</em></div>}
              {index < STEPS.length - 1 && <i className="ribbon-arrow" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
