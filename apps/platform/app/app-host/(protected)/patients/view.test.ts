import type { AppointmentRow } from "@fynix/db";
import { describe, expect, it } from "vitest";
import {
  appointmentHref,
  countLabel,
  emptyListLabel,
  formatShortDate,
  pageCount,
  pageItems,
  pageRangeLabel,
  parsePageParam,
  parsePatientFilter,
  patientFigures,
  patientsHref,
  type PageItem,
} from "./view";

const NOW = new Date("2026-09-29T06:00:00Z");

function appointment(id: string, overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id,
    practitionerId: "0192f3c4-3333-7000-8000-00000000000a",
    patientId: "0192f3c4-4444-7000-8000-000000000001",
    patientName: "Arjun Menon",
    phone: "+919876543210",
    email: null,
    serviceId: null,
    serviceName: null,
    patientNote: null,
    localDate: "2026-09-28",
    localStart: "09:00",
    localEnd: "09:30",
    startsAt: new Date("2026-09-28T03:30:00Z"),
    endsAt: new Date("2026-09-28T04:00:00Z"),
    status: "booked",
    cancelReason: null,
    clinicNote: null,
    cancelledAt: null,
    doneAt: null,
    noShowAt: null,
    source: "online",
    createdAt: new Date("2026-09-20T00:00:00Z"),
    handledByUserId: null,
    seenAt: null,
    ...overrides,
  };
}

describe("parsePatientFilter", () => {
  it("reads each of the four filters", () => {
    expect(parsePatientFilter("all")).toBe("all");
    expect(parsePatientFilter("upcoming")).toBe("upcoming");
    expect(parsePatientFilter("new")).toBe("new");
    expect(parsePatientFilter("lapsed")).toBe("lapsed");
  });

  it("falls back to all for anything else", () => {
    expect(parsePatientFilter(undefined)).toBe("all");
    expect(parsePatientFilter("")).toBe("all");
    expect(parsePatientFilter("Upcoming")).toBe("all");
    expect(parsePatientFilter(["new", "lapsed"])).toBe("all");
  });
});

describe("patientsHref", () => {
  it("is the bare page for All with no search", () => {
    expect(patientsHref("all", "")).toBe("/patients");
  });

  it("carries the filter and the search together", () => {
    expect(patientsHref("upcoming", "")).toBe("/patients?filter=upcoming");
    expect(patientsHref("all", "ravi")).toBe("/patients?q=ravi");
    expect(patientsHref("lapsed", "98 20")).toBe("/patients?filter=lapsed&q=98+20");
  });

  it("encodes a search that holds URL syntax", () => {
    expect(patientsHref("all", "a&b=c")).toBe("/patients?q=a%26b%3Dc");
  });
});

describe("emptyListLabel", () => {
  it("names the search when there is one, whatever the filter", () => {
    expect(emptyListLabel("upcoming", "ravi")).toBe("No patients match that search.");
  });

  it("has a line per filter", () => {
    expect(emptyListLabel("all", "")).toBe("No patients yet.");
    expect(emptyListLabel("upcoming", "")).toBe("No upcoming visits.");
    expect(emptyListLabel("new", "")).toBe("No new patients this month.");
    expect(emptyListLabel("lapsed", "")).toBe("Everyone has been seen recently.");
  });
});

describe("formatShortDate", () => {
  it("leaves the year off in the current year", () => {
    expect(formatShortDate("2026-09-08", 2026)).toBe("8 Sep");
  });

  it("adds the year otherwise", () => {
    expect(formatShortDate("2025-12-31", 2026)).toBe("31 Dec 2025");
  });

  it("refuses a value that is not a date", () => {
    expect(() => formatShortDate("28/09/2026", 2026)).toThrow(RangeError);
  });
});

describe("appointmentHref", () => {
  it("opens the booking on its own day's Today view", () => {
    expect(appointmentHref({ id: "0192f3c4-2222-7000-8000-000000000002", localDate: "2026-09-28" })).toBe(
      "/appointments?view=today&day=2026-09-28&booking=0192f3c4-2222-7000-8000-000000000002",
    );
  });
});

describe("patientFigures", () => {
  it("counts visits and no-shows and ignores cancelled bookings", () => {
    const figures = patientFigures(
      [
        appointment("a", { status: "done" }),
        appointment("b", { status: "done" }),
        appointment("c", { status: "no_show" }),
        appointment("d", { status: "cancelled" }),
      ],
      NOW,
    );
    expect(figures).toEqual({ visits: 2, noShows: 1, next: null });
  });

  it("picks the soonest booking still ahead, whatever the input order", () => {
    const later = appointment("later", { startsAt: new Date("2026-10-10T04:30:00Z"), localDate: "2026-10-10" });
    const sooner = appointment("sooner", { startsAt: new Date("2026-10-01T04:30:00Z"), localDate: "2026-10-01" });
    expect(patientFigures([later, sooner], NOW).next?.id).toBe("sooner");
  });

  it("does not count a booked slot that has already started as next", () => {
    const started = appointment("started", { startsAt: new Date("2026-09-29T05:30:00Z") });
    expect(patientFigures([started], NOW).next).toBeNull();
  });

  it("does not count a cancelled future booking as next", () => {
    const cancelled = appointment("cancelled", { status: "cancelled", startsAt: new Date("2026-10-01T04:30:00Z") });
    expect(patientFigures([cancelled], NOW).next).toBeNull();
  });
});

describe("countLabel", () => {
  it("is singular for one", () => {
    expect(countLabel(1, "visit", "visits")).toBe("1 visit");
    expect(countLabel(0, "visit", "visits")).toBe("0 visits");
    expect(countLabel(12, "visit", "visits")).toBe("12 visits");
  });
});

describe("parsePageParam", () => {
  it("reads a plain positive whole number", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("7")).toBe(7);
  });

  it("falls back to page 1 for anything else", () => {
    for (const raw of [undefined, "", "0", "-2", "2.5", "abc", "1e3", " 3"]) expect(parsePageParam(raw)).toBe(1);
    expect(parsePageParam(["2", "3"])).toBe(1);
  });

  it("caps an absurd page number", () => {
    expect(parsePageParam("999999")).toBe(10_000);
  });
});

describe("pageCount", () => {
  it("rounds up, and is at least one page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
    expect(pageCount(212)).toBe(9);
    expect(pageCount(10, 3)).toBe(4);
  });
});

/** Page items as a compact string, e.g. "1 … 4 5 6 … 12". */
function render(items: readonly PageItem[]): string {
  return items.map((item) => (item.kind === "gap" ? "…" : String(item.page))).join(" ");
}

describe("pageItems", () => {
  it("lists every page when there are few", () => {
    expect(render(pageItems(1, 1))).toBe("1");
    expect(render(pageItems(2, 3))).toBe("1 2 3");
    expect(render(pageItems(3, 5))).toBe("1 2 3 4 5");
  });

  it("shows the first, the last and the current page's neighbours, with gaps between", () => {
    expect(render(pageItems(5, 12))).toBe("1 … 4 5 6 … 12");
    expect(render(pageItems(1, 12))).toBe("1 2 … 12");
    expect(render(pageItems(12, 12))).toBe("1 … 11 12");
  });

  it("never uses a gap to hide a single page", () => {
    expect(render(pageItems(4, 12))).toBe("1 2 3 4 5 … 12");
    expect(render(pageItems(9, 12))).toBe("1 … 8 9 10 11 12");
  });

  it("gives every gap a distinct key", () => {
    const keys = pageItems(6, 12).flatMap((item) => (item.kind === "gap" ? [item.key] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("patientsHref with a page", () => {
  it("leaves page 1 out and keeps the filter and search", () => {
    expect(patientsHref("all", "", 1)).toBe("/patients");
    expect(patientsHref("all", "", 3)).toBe("/patients?page=3");
    expect(patientsHref("upcoming", "anita", 2)).toBe("/patients?filter=upcoming&q=anita&page=2");
  });
});

describe("pageRangeLabel", () => {
  it("names the rows on this page and the total", () => {
    expect(pageRangeLabel(1, 25, 212)).toBe("Showing 1–25 of 212");
    expect(pageRangeLabel(9, 12, 212)).toBe("Showing 201–212 of 212");
  });
});
