import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, afterEach, vi } from "vitest";
import { PasswordInput } from "../src/components/PasswordInput";

afterEach(() => cleanup());

describe("PasswordInput", () => {
  it("renders with type=password by default", () => {
    render(<PasswordInput label="Password" value="" onChange={() => {}} required />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("toggles visibility and updates aria-label on click", () => {
    render(<PasswordInput label="Password" value="" onChange={() => {}} required />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    screen.getByRole("button", { name: "Hide password" });

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
    screen.getByRole("button", { name: "Show password" });
  });

  it("preserves value across toggle", () => {
    render(<PasswordInput label="Password" value="secret123" onChange={() => {}} required />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("secret123");
  });

  it("calls onChange on input", () => {
    const onChange = vi.fn();
    render(<PasswordInput label="Password" value="" onChange={onChange} required />);
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "newpass" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as React.ChangeEvent<HTMLInputElement>).target).toBe(input);
  });
});