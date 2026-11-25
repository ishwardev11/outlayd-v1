import { test } from "node:test"
import assert from "node:assert/strict"
import { countCategories, mostUsed, ruleSuggestion, type CategoryOption } from "./category-suggest"

const cats: CategoryOption[] = [
    { id: "transport", name: "Transport", kind: "expense" },
    { id: "meals", name: "Meals", kind: "expense" },
    { id: "hire", name: "Hall hire", kind: "income" },
]

test("counts a record's category and its splits (as the Contacts page did)", () => {
    const counts = countCategories([
        { category_id: "transport" },
        { category_id: null, splits: [{ category_id: "meals" } as never, null, { category_id: "transport" } as never] },
    ])
    assert.deepEqual([...counts], [["transport", 2], ["meals", 1]])
    assert.deepEqual(mostUsed(counts), { id: "transport", count: 2 })
    assert.equal(mostUsed(new Map()), null)
    assert.deepEqual(mostUsed(counts, (id) => id !== "transport"), { id: "meals", count: 1 })
})

test("a known payee: its default category first, then the one used most, with the reason", () => {
    const usage = new Map([["grab", new Map([["transport", 12], ["meals", 2]])]])
    const ctx = { defaults: new Map<string, string | null>(), usage, categories: cats }
    assert.deepEqual(ruleSuggestion({ payeeId: "grab", payeeName: "Grab", kind: "expense" }, ctx),
        { categoryId: "transport", reason: "Used for Grab 12 times", source: "history" })

    ctx.defaults.set("grab", "meals")
    assert.deepEqual(ruleSuggestion({ payeeId: "grab", payeeName: "Grab", kind: "expense" }, ctx),
        { categoryId: "meals", reason: "Default category for Grab", source: "default" })
})

test("only a category of the right kind is suggested; no history means no rule suggestion", () => {
    const ctx = { defaults: new Map([["club", "transport"]]), usage: new Map([["club", new Map([["hire", 1]])]]), categories: cats }
    assert.deepEqual(ruleSuggestion({ payeeId: "club", payeeName: "Club", kind: "income" }, ctx),
        { categoryId: "hire", reason: "Used for Club 1 time", source: "history" }, "an expense default is not used for income")
    assert.equal(ruleSuggestion({ payeeId: "new", payeeName: "New", kind: "expense" }, ctx), null)
    assert.equal(ruleSuggestion({ payeeId: null, payeeName: "Walk-in", kind: "expense" }, ctx), null)
})
