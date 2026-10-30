import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { ExpandingTextarea } from "./expanding-textarea"

it("fits existing text and grows and shrinks when its value changes", () => {
  const height = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLTextAreaElement) { return this.value.length > 20 ? 180 : 80 })
  const view = render(<ExpandingTextarea aria-label="Controls" value="Existing long controls that should all be visible" readOnly />)
  expect(screen.getByLabelText("Controls")).toHaveStyle({ height: "180px" })
  view.rerender(<ExpandingTextarea aria-label="Controls" value="Short" readOnly />)
  expect(screen.getByLabelText("Controls")).toHaveStyle({ height: "80px" })
  view.rerender(<ExpandingTextarea aria-label="Controls" value="Another long control with multiple lines\nSecond line" readOnly />)
  expect(screen.getByLabelText("Controls")).toHaveStyle({ height: "180px" })
  height.mockRestore()
})
