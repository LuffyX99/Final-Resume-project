import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SkillTagInput from "../SkillTagInput";

function Harness({
  initial = [],
  maxSkills = 30,
}: {
  initial?: string[];
  maxSkills?: number;
}) {
  const [skills, setSkills] = useState(initial);

  return (
    <div>
      <SkillTagInput
        id="skills"
        value={skills}
        onChange={setSkills}
        maxSkills={maxSkills}
      />
      <output data-testid="skills">{skills.join("|")}</output>
    </div>
  );
}

function input() {
  return screen.getByPlaceholderText("Type a skill and press Enter");
}

describe("SkillTagInput", () => {
  it("adds a skill on Enter and clears the draft", () => {
    render(<Harness />);

    fireEvent.change(input(), { target: { value: "Python" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(screen.getByTestId("skills")).toHaveTextContent("Python");
    expect(input()).toHaveValue("");
    expect(screen.getByLabelText("Remove Python")).toBeInTheDocument();
  });

  it("adds skills on comma and ignores case-insensitive duplicates", () => {
    render(<Harness />);

    fireEvent.change(input(), { target: { value: "React," } });
    fireEvent.keyDown(input(), { key: "," });
    expect(screen.getByTestId("skills")).toHaveTextContent("React");

    fireEvent.change(input(), { target: { value: "react," } });
    fireEvent.keyDown(input(), { key: "," });
    expect(screen.getByTestId("skills")).toHaveTextContent("React");
    expect(screen.getByTestId("skills").textContent).toBe("React");
  });

  it("splits pasted comma/newline-separated values", () => {
    render(<Harness />);

    fireEvent.paste(input(), {
      clipboardData: {
        getData: () => "Python, FastAPI\nPostgreSQL",
      },
    });

    expect(screen.getByTestId("skills").textContent).toBe(
      "Python|FastAPI|PostgreSQL",
    );
  });

  it("removes a skill with its remove button", () => {
    render(<Harness initial={["Python", "FastAPI"]} />);

    fireEvent.click(screen.getByLabelText("Remove Python"));

    expect(screen.getByTestId("skills").textContent).toBe("FastAPI");
  });

  it("removes the last skill with Backspace on an empty draft", () => {
    render(<Harness initial={["Python", "FastAPI"]} />);

    fireEvent.keyDown(input(), { key: "Backspace" });

    expect(screen.getByTestId("skills").textContent).toBe("Python");
  });

  it("commits a typed skill on blur", () => {
    render(<Harness />);

    fireEvent.change(input(), { target: { value: "Docker" } });
    fireEvent.blur(input());

    expect(screen.getByTestId("skills")).toHaveTextContent("Docker");
  });

  it("enforces the maximum number of skills", () => {
    render(<Harness maxSkills={2} />);

    fireEvent.change(input(), { target: { value: "One,Two,Three," } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(screen.getByTestId("skills").textContent).toBe("One|Two");
    expect(
      screen.getByText(/Maximum of 2 skills reached/),
    ).toBeInTheDocument();
  });
});
