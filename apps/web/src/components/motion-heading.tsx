/** React owns these fragments so route updates never fight a text-splitting plugin. */
export function MotionHeading({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="ms-heading-fragments">
        {text.split(/(\s+)/).map((word, index) => /^\s+$/.test(word) ? word : (
          <span className="ms-heading-word" key={index}>
            {Array.from(word).map((character, charIndex) => <span className="ms-heading-character" key={charIndex}>{character}</span>)}
          </span>
        ))}
      </span>
    </>
  );
}
