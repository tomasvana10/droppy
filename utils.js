const { Config } = require("./json");

const extractActiveMapRegex = /.*[✘✔»] ([\w\s\-']+) ◀.*/;
const extractOtherMapRegex = /.*[✘✔»] ([\w\s\-']+)/;
const extractNextMapRegex = /\" ✘ [\w\s\-']+◀\"}TextHelper:{\"text\": \" ✘ ([\w\s\-']+)/;
const forcedActiveMap = { val: null };

const getMapInfo = () => {
  const lines = World.getScoreboards()?.getCurrentScoreboard()?.scoreToDisplayName();
  let active = null;
  let other = [];
  let revStr = "";

  for (const line of lines?.values() ?? []) {
    revStr = line + revStr;
    const str = Chat.sectionSymbolToAmpersand(line.getStringStripFormatting()).replaceAll(/&./g, "");
    const activeMatch = str.match(extractActiveMapRegex);

    const otherMatch = str.match(extractOtherMapRegex);
    if (activeMatch?.[1]) {
      active = activeMatch[1].trim();
    } else if (otherMatch?.[1]) {
      other.push(otherMatch[1].trim());
    }
  }
  const fmtRevStr = Chat.sectionSymbolToAmpersand(revStr).replaceAll(/&\w/g, "");
  const next = fmtRevStr.match(extractNextMapRegex)?.[1].trim().replaceAll(" ", "_") ?? null;

  return {
    active:
      forcedActiveMap.val ||
      active?.split(" ")?.join("_") ||
      (JSON.stringify([...(lines?.values() ?? [])].map((val) => val.getStringStripFormatting()))
        .match(/Map: ([\w\s\-']+)/)?.[1]
        .split(" ")
        .join("_") ??
        null),
    other: other.filter((map) => map !== next),
    next,
    isFirstMap: Boolean(fmtRevStr.match(/(Current Map \(1\/15\))/)?.[1]),
  };
};

const isDropperGame = () => World.getScoreboards()?.getCurrentScoreboard()?.getDisplayName().getString() === "DROPPER";

const arrsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const areNearbyChunksLoaded = () => {
  const player = Player.getPlayer();
  const cx = player.getX() >> 4;
  const cz = player.getZ() >> 4;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (!World.isChunkLoaded(cx + dx, cz + dz)) return false;
    }
  }
  return true;
};

const nearPortal = () => {
  const pos = Player.getPlayer().getBlockPos();
  return (
    ["north", "south", "east", "west"].some(
      (dir) => World.getBlock(pos[dir]())?.getId() === "minecraft:nether_portal"
    ) ||
    World.getBlock(pos.down()[Player.getPlayer().getFacingDirection().getName()]())?.getId() ===
      "minecraft:nether_portal"
  );
};

const log = (msg, colour = 0xf, forVerboseMode = false) => {
  if (forVerboseMode && !Config.LOCAL.verbose) return;

  Chat.log(
    Chat.createTextBuilder()
      .append("[")
      .withColor(0x7)
      .append("Droppy")
      .withColor(0x4)
      .append("]")
      .withColor(0x7)
      .append(` ${msg}`)
      .withColor(colour)
      .build()
  );
};

module.exports = { arrsEqual, getMapInfo, isDropperGame, nearPortal, log, areNearbyChunksLoaded, forcedActiveMap };
