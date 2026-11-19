import path from "path";
import { Project } from "../types.js";

/**
 * Generate Final Cut Pro 7 / Premiere Pro XML (xmeml version 4)
 * Fully compatible with Adobe Premiere Pro, DaVinci Resolve, and Final Cut Pro.
 */
export function generatePremiereXml(project: Project, fps = 30, width = 1080, height = 1920): string {
  const timebase = fps;
  const originalDurationFrames = Math.round(project.duration * timebase);

  // Helper to escape XML strings
  const esc = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const originalPath = path.resolve(project.originalFilePath);
  const originalFileUrl = `file://localhost${originalPath.replace(/\\/g, "/")}`;

  let currentTimelineFrame = 0;
  const videoClipsXml: string[] = [];
  const audioClipsXml: string[] = [];

  project.keepTimeline.forEach((seg, idx) => {
    const inFrame = Math.round(seg.start * timebase);
    const outFrame = Math.round(seg.end * timebase);
    const durationFrames = Math.max(1, outFrame - inFrame);
    const startFrame = currentTimelineFrame;
    const endFrame = startFrame + durationFrames;

    // Video Clip on Track 1
    videoClipsXml.push(`
        <clipitem id="clipitem-v-${idx + 1}">
          <masterclipid>masterclip-1</masterclipid>
          <name>${esc(project.originalFileName)} [Part ${idx + 1}]</name>
          <enabled>TRUE</enabled>
          <duration>${originalDurationFrames}</duration>
          <rate>
            <timebase>${timebase}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <start>${startFrame}</start>
          <end>${endFrame}</end>
          <in>${inFrame}</in>
          <out>${outFrame}</out>
          <file id="file-1">
            <name>${esc(project.originalFileName)}</name>
            <pathurl>${esc(originalFileUrl)}</pathurl>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <duration>${originalDurationFrames}</duration>
            <media>
              <video>
                <samplecharacteristics>
                  <width>${width}</width>
                  <height>${height}</height>
                </samplecharacteristics>
              </video>
              <audio>
                <samplecharacteristics>
                  <samplerate>48000</samplerate>
                  <depth>16</depth>
                </samplecharacteristics>
                <channelcount>2</channelcount>
              </audio>
            </media>
          </file>
        </clipitem>`);

    // Audio Clip on Track 1
    audioClipsXml.push(`
        <clipitem id="clipitem-a-${idx + 1}">
          <masterclipid>masterclip-1</masterclipid>
          <name>${esc(project.originalFileName)} [Part ${idx + 1}]</name>
          <enabled>TRUE</enabled>
          <duration>${originalDurationFrames}</duration>
          <rate>
            <timebase>${timebase}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <start>${startFrame}</start>
          <end>${endFrame}</end>
          <in>${inFrame}</in>
          <out>${outFrame}</out>
          <file id="file-1"/>
          <sourcetrack>
            <mediatype>audio</mediatype>
            <trackindex>1</trackindex>
          </sourcetrack>
        </clipitem>`);

    currentTimelineFrame = endFrame;
  });

  // B-Roll track (Track 2) if overlays exist
  const brollClipsXml: string[] = [];
  if (project.brollOverlays && project.assets) {
    const assetMap = new Map(project.assets.map((a) => [a.id, a]));
    project.brollOverlays.forEach((overlay, bIdx) => {
      const asset = assetMap.get(overlay.assetId);
      if (!asset) return;

      const bStartFrame = Math.round(overlay.start * timebase);
      const bEndFrame = Math.round(overlay.end * timebase);
      const bDurFrames = Math.max(1, bEndFrame - bStartFrame);
      const brollPath = path.resolve(asset.filePath);
      const brollUrl = `file://localhost${brollPath.replace(/\\/g, "/")}`;

      brollClipsXml.push(`
        <clipitem id="clipitem-broll-${bIdx + 1}">
          <masterclipid>masterclip-broll-${bIdx + 1}</masterclipid>
          <name>${esc(asset.fileName)}</name>
          <enabled>TRUE</enabled>
          <duration>${bDurFrames}</duration>
          <rate>
            <timebase>${timebase}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <start>${bStartFrame}</start>
          <end>${bEndFrame}</end>
          <in>0</in>
          <out>${bDurFrames}</out>
          <file id="file-broll-${bIdx + 1}">
            <name>${esc(asset.fileName)}</name>
            <pathurl>${esc(brollUrl)}</pathurl>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <duration>${bDurFrames}</duration>
            <media>
              <video>
                <samplecharacteristics>
                  <width>${width}</width>
                  <height>${height}</height>
                </samplecharacteristics>
              </video>
            </media>
          </file>
        </clipitem>`);
    });
  }

  const totalTimelineDurationFrames = currentTimelineFrame;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>${esc(project.originalFileName)} - AutoCut Sequence</name>
    <duration>${totalTimelineDurationFrames}</duration>
    <rate>
      <timebase>${timebase}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${width}</width>
            <height>${height}</height>
            <pixelaspectratio>square</pixelaspectratio>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
          </samplecharacteristics>
        </format>
        <track>
          ${videoClipsXml.join("")}
        </track>
        ${
          brollClipsXml.length > 0
            ? `<track>
          ${brollClipsXml.join("")}
        </track>`
            : ""
        }
      </video>
      <audio>
        <track>
          ${audioClipsXml.join("")}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`;
}
