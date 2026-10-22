import { describe, expect, it } from "vitest";
import { parseRoute, shelfHash } from "./route.js";

describe("parseRoute", () => {
  it("treats an empty hash as the hub", () => {
    expect(parseRoute("")).toEqual({ view: "hub" });
    expect(parseRoute("#/")).toEqual({ view: "hub" });
  });

  it("reads ledger and audio capture routes", () => {
    expect(parseRoute("#/ledger")).toEqual({ view: "ledger" });
    expect(parseRoute("#/audio")).toEqual({ view: "audio" });
  });

  it("reads the install guide route", () => {
    expect(parseRoute("#/install")).toEqual({ view: "install" });
  });

  it("reads a shelf slug", () => {
    expect(parseRoute("#/shelf/preferences")).toEqual({
      view: "shelf",
      slug: "preferences",
    });
    expect(parseRoute(shelfHash("reading notes"))).toEqual({
      view: "shelf",
      slug: "reading notes",
    });
  });
});
