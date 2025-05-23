const { Config } = require("./config");

const extractActiveMapRegex = /.*[✘✔»] ([\w\s\-']+) ◀.*/;
const extractOtherMapRegex = /.*[✘✔»] ([\w\s\-']+)/;

const getMapInfo = () => {
  const lines = World.getScoreboards()?.getCurrentScoreboard()?.scoreToDisplayName();
  let active = null;
  let other = [];

  for (const line of lines?.values() ?? []) {
    const str = Chat.sectionSymbolToAmpersand(line.getStringStripFormatting()).replaceAll(/&./g, "");
    const activeMatch = str.match(extractActiveMapRegex);

    const otherMatch = str.match(extractOtherMapRegex);
    if (activeMatch?.[1]) {
      active = activeMatch[1].trim();
    } else if (otherMatch?.[1]) {
      other.push(otherMatch[1].trim());
    }
  }

  return {
    active:
      active?.split(" ")?.join("_") ||
      (JSON.stringify([...(lines?.values() ?? [])].map((val) => val.getStringStripFormatting()))
        .match(/Map: ([\w\s\-']+)/)?.[1]
        .split(" ")
        .join("_") ??
        null),
    other,
  };
};

const isDropperGame = () => World.getScoreboards()?.getCurrentScoreboard()?.getDisplayName().getString() === "DROPPER";

const arrsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const nearPortal = () => {
  const pos = Player.getPlayer().getBlockPos();
  return ["north", "south", "east", "west"].some(
    (dir) => World.getBlock(pos[dir]()).getId() === "minecraft:nether_portal"
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

module.exports = { arrsEqual, getMapInfo, isDropperGame, nearPortal, log };
