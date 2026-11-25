import { useState, useRef, type KeyboardEvent } from "react";

interface SkillTagInputProps {
  value?: string[];
  skills?: string[];
  onChange: (skills: string[]) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  maxSkills?: number;
  describedBy?: string;
}

export default function SkillTagInput({
  value,
  skills: skillsProp,
  onChange,
  placeholder = "Type a skill and press Enter",
  label,
  id = "skill-input",
  maxSkills = 30,
  describedBy,
}: SkillTagInputProps) {
  const skills = value ?? skillsProp ?? [];
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addSkills(raw: string[]) {
    const next = [...skills];
    for (const r of raw) {
      const parts = r.split(/[,\n]+/);
      for (const part of parts) {
        const skill = part.trim();
        if (!skill) continue;
        if (next.length >= maxSkills) break;
        const exists = next.some(
          (s) => s.toLowerCase() === skill.toLowerCase(),
        );
        if (!exists) {
          next.push(skill);
        }
      }
    }
    onChange(next);
    setInput("");
  }

  function addSkill(raw: string) {
    addSkills([raw]);
  }

  function removeSkill(index: number) {
    onChange(skills.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(input);
    } else if (e.key === "Backspace" && !input && skills.length > 0) {
      removeSkill(skills.length - 1);
    }
  }

  function handleBlur() {
    if (input.trim()) {
      addSkill(input);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    addSkills([text]);
  }

  const atMax = skills.length >= maxSkills;

  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="mb-2 block text-sm font-medium text-base-200"
        >
          {label}
        </label>
      )}
      <div
        className="flex flex-wrap items-center gap-2 rounded-xl border border-base-600 bg-base-800 px-3 py-2.5 transition-all duration-200 focus-within:border-neon focus-within:ring-1 focus-within:ring-neon/30 cursor-text min-h-[46px]"
        onClick={() => inputRef.current?.focus()}
      >
        {skills.map((skill, i) => (
          <span
            key={`${skill}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-neon/10 border border-neon/20 px-3 py-1 text-xs font-medium text-neon animate-fade-in-scale"
          >
            {skill}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeSkill(i);
              }}
              className="ml-0.5 rounded-full p-0.5 text-neon/60 hover:text-neon hover:bg-neon/10 transition-colors duration-150"
              aria-label={`Remove ${skill}`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {!atMax && (
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-describedby={describedBy}
            className="flex-1 min-w-[120px] border-none bg-transparent px-1 py-0.5 text-sm text-base-50 placeholder-base-400 outline-none focus:ring-0"
            style={{ border: "none", boxShadow: "none" }}
          />
        )}
      </div>
      {atMax && (
        <p className="mt-1.5 text-xs text-amber-accent">
          Maximum of {maxSkills} skills reached.
        </p>
      )}
    </div>
  );
}
