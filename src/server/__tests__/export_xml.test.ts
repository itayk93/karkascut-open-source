import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePremiereXml } from "../services/exportXml.js";
import { Project } from "../types.js";

describe("Premiere Pro & FCP XML Export Service", () => {
  it("Generates valid XML structure with sequence and clip items", () => {
    const dummyProject: Project = {
      id: "test_proj_xml",
      originalFileName: "test_video.mp4",
      originalFilePath: "/dummy/path/test_video.mp4",
      audioFilePath: "/dummy/path/audio.mp3",
      duration: 30,
      status: "ready",
      cuts: [],
      keepTimeline: [
        { start: 0, end: 5 },
        { start: 10, end: 20 }
      ],
      assets: [
        {
          id: "broll_1",
          fileName: "photo.jpg",
          filePath: "/dummy/path/photo.jpg",
          fileUrl: "/media/photo.jpg",
          type: "image"
        }
      ],
      brollOverlays: [
        {
          id: "overlay_1",
          assetId: "broll_1",
          start: 2,
          end: 4,
          reason: "Illustrating point"
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const xml = generatePremiereXml(dummyProject, 30, 1080, 1920);

    assert.ok(xml.includes('<?xml version="1.0" encoding="UTF-8"?>'), "Has XML declaration");
    assert.ok(xml.includes('<xmeml version="4">'), "Has xmeml root element");
    assert.ok(xml.includes('<sequence id="sequence-1">'), "Has sequence element");
    assert.ok(xml.includes("<width>1080</width>"), "Has vertical width 1080");
    assert.ok(xml.includes("<height>1920</height>"), "Has vertical height 1920");
    assert.ok(xml.includes("test_video.mp4 [Part 1]"), "Has first clip title");
    assert.ok(xml.includes("test_video.mp4 [Part 2]"), "Has second clip title");
    assert.ok(xml.includes('<clipitem id="clipitem-broll-1">'), "Has B-roll overlay track item");
    assert.ok(xml.includes("photo.jpg"), "References B-roll asset filename");
  });
});
