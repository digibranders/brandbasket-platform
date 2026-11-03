import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";
import { Combobox } from "./combobox";
import { Field } from "./field";
import { Input } from "./input";
import { PhoneInput } from "./phone-input";
import { Radio, RadioCard, RadioGroup } from "./radio";
import { Select } from "./select";
import { Switch } from "./switch";
import { expectNoAxeViolations } from "./test-axe";
import { Textarea } from "./textarea";

const CITIES = [
  { value: "pune", label: "Pune" },
  { value: "mumbai", label: "Mumbai" },
  { value: "nagpur", label: "Nagpur" },
];

describe("Field with Input", () => {
  it("labels the input, describes it with the hint and marks it invalid with the error", async () => {
    const { container } = render(
      <Field label="Business name" name="name" hint="Shown on your website." error="Enter your business name.">
        <Input defaultValue="" />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Business name" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter your business name.")).toBeTruthy();
    await userEvent.type(input, "Apex");
    expect((input as HTMLInputElement).value).toBe("Apex");
    await expectNoAxeViolations(container);
  });

  it("is not invalid without an error", () => {
    render(
      <Field label="City">
        <Input />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "City" }).getAttribute("aria-invalid")).not.toBe("true");
  });
});

describe("Textarea", () => {
  it("is a labelled multi-line box", async () => {
    render(
      <Field label="What should change?">
        <Textarea />
      </Field>,
    );
    const box = screen.getByRole("textbox", { name: "What should change?" });
    expect(box.tagName).toBe("TEXTAREA");
    await userEvent.type(box, "New photo{Enter}on Home");
    expect((box as HTMLTextAreaElement).value).toBe("New photo\non Home");
  });
});

describe("PhoneInput", () => {
  it("asks for a phone number with the India code shown", () => {
    render(
      <Field label="Phone">
        <PhoneInput />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Phone" });
    expect(input.getAttribute("type")).toBe("tel");
    expect(input.getAttribute("inputmode")).toBe("tel");
    expect(screen.getByText("+91")).toBeTruthy();
  });
});

describe("Select", () => {
  it("opens from the keyboard and picks an option", async () => {
    const onValueChange = vi.fn();
    render(<Select aria-label="City" options={CITIES} placeholder="Choose a city" onValueChange={onValueChange} />);
    const trigger = screen.getByRole("combobox", { name: "City" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.click(await screen.findByRole("option", { name: "Mumbai" }));
    expect(onValueChange).toHaveBeenCalledWith("mumbai");
  });

  it("takes its name from a Field label", () => {
    render(
      <Field label="City" nativeLabel={false}>
        <Select options={CITIES} />
      </Field>,
    );
    expect(screen.getByRole("combobox", { name: "City" })).toBeTruthy();
  });
});

describe("Combobox", () => {
  it("filters the options as you type and picks one", async () => {
    const onValueChange = vi.fn();
    render(
      <Field label="City">
        <Combobox options={CITIES} emptyText="No city matches." openLabel="Show cities" onValueChange={onValueChange} />
      </Field>,
    );
    const input = screen.getByRole("combobox", { name: "City" });
    await userEvent.type(input, "na");
    expect(await screen.findByRole("option", { name: "Nagpur" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Pune" })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Nagpur" }));
    expect(onValueChange).toHaveBeenCalledWith(CITIES[2]);
  });
});

describe("Checkbox", () => {
  // Clicking the label text toggles it: the whole row is the target. (happy-dom doubles a Space press on a label-wrapped
  // span, so the keyboard is covered by Base UI's own tests and the browser walk, not here.)
  it("is named by its label and toggles from its label", async () => {
    const onCheckedChange = vi.fn();
    const { container } = render(<Checkbox label="Email me about new enquiries" onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "Email me about new enquiries" });
    await userEvent.click(screen.getByText("Email me about new enquiries"));
    expect(onCheckedChange.mock.calls).toEqual([[true]]);
    expect(box.getAttribute("aria-checked")).toBe("true");
    await expectNoAxeViolations(container);
  });
});

describe("Radio and RadioCard", () => {
  it("moves between options with the arrow keys", async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Contact by" defaultValue="email" onValueChange={onValueChange}>
        <Radio value="email" label="Email" />
        <Radio value="phone" label="Phone" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radiogroup", { name: "Contact by" })).toBeTruthy();
    screen.getByRole("radio", { name: "Email" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onValueChange).toHaveBeenCalledWith("phone");
    expect(screen.getByRole("radio", { name: "Phone" }).getAttribute("aria-checked")).toBe("true");
  });

  it("gives each card its sentence", async () => {
    const { container } = render(
      <RadioGroup aria-label="What do you need?">
        <RadioCard value="change" label="A change" description="Something on your website or posts." />
        <RadioCard value="question" label="A question" description="We reply within one working day." />
      </RadioGroup>,
    );
    await userEvent.click(screen.getByText("A question"));
    expect(screen.getByRole("radio", { name: /A question/ }).getAttribute("aria-checked")).toBe("true");
    await expectNoAxeViolations(container);
  });
});

describe("Switch", () => {
  it("is a named switch that flips once per click", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Weekly summary" hideLabel onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole("switch", { name: "Weekly summary" });
    await userEvent.click(control);
    expect(onCheckedChange.mock.calls).toEqual([[true]]);
    expect(control.getAttribute("aria-checked")).toBe("true");
  });
});
