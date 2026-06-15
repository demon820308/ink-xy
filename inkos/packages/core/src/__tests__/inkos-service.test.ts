import { describe, expect, it, vi } from "vitest";
import { InkOSService } from "../service/inkos-service.js";

describe("InkOSService", () => {
  it("can be instantiated and has expected methods", () => {
    const service = new InkOSService({
      projectRoot: "/tmp/fake-project",
    });

    expect(service).toBeDefined();
    expect(typeof service.initProject).toBe("function");
    expect(typeof service.createBook).toBe("function");
    expect(typeof service.writeNextChapter).toBe("function");
    expect(typeof service.writeDraft).toBe("function");
    expect(typeof service.reviseDraft).toBe("function");
    expect(typeof service.auditDraft).toBe("function");
    expect(typeof service.planChapter).toBe("function");
    expect(typeof service.composeChapter).toBe("function");
    expect(typeof service.resyncChapterArtifacts).toBe("function");
    expect(typeof service.consolidate).toBe("function");
    expect(typeof service.importChapters).toBe("function");
    expect(typeof service.importCanon).toBe("function");
    expect(typeof service.generateStyleGuide).toBe("function");
    expect(typeof service.runRadar).toBe("function");
    expect(typeof service.detectChapter).toBe("function");
  });
});
