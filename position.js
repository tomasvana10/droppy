const { getMapInfo, log } = require("./utils");

/*
The majority of this file calculates where the player must jump from, as the absolute
coordinates of a dropper map are never the same.

Each dropper map has at LEAST 1 vantage point (basically all have 4 except castle)
in the north/south/east/west where the player can drop from. Macros are recorded 
from one of these vantage points and can only be replaced from the same vantage 
point (the script handles cases where the current vantage point has no macros 
accordingly by repositioning the player).
*/

const getVantagePointOffsets = () => {
  const activeMap = getMapInfo().active;
  const offsets = VANTAGE_POINT_OFFSET_MAP[activeMap] ?? VANTAGE_POINT_OFFSET_MAP[__REST__];

  if (Array.isArray(offsets)) {
    const [offsetX, offsetY, offsetZ] = offsets;
    return {
      north: [0, offsetY, -offsetZ],
      east: [offsetX, offsetY, 0],
      south: [0, offsetY, offsetZ],
      west: [-offsetX, offsetY, 0],
    };
  }

  const restOffset = VANTAGE_POINT_OFFSET_MAP[__REST__][0];
  return {
    north: offsets.north ?? [0, 0, -restOffset],
    east: offsets.east ?? [restOffset, 0, 0],
    south: offsets.south ?? [0, 0, restOffset],
    west: offsets.west ?? [-restOffset, 0, 0],
  };
};

// key that denotes the default values of a particular data object
const __REST__ = "%REST%";

const VANTAGE_POINT_OFFSET_MAP = {
  "Revolve": [2, 0, 2],
  "Microscope": [3, 0, 3],
  "Launch_Zone": [3, 0, 3],
  "Fly_Trap": [5, 0, 5],
  "Nightlife": [3, 0, 3],
  "Drainage": [5, 0, 5],
  "Time": {
    north: [0, 0, -5],
    // directions that aren't provided are equivalent to __REST__
  },
  "Warp": {
    south: [0, -1, 2],
  },
  "Iris": {
    south: [0, 0, 5],
  },
  [__REST__]: [4, 0, 4],
};

const ABSOLUTE_CENTER_NONAIR_NEIGHBOURS = {
  "Warportal": { corners: 0, edges: 0 },
  "Bird_Cage": { corners: 0, edges: 0 },
  [__REST__]: { corners: 2, edges: 1 },
};

const ABSOLUTE_CENTER_SCAN_DISTANCE = {
  "Warportal": 5,
  "Bird_Cage": 5,
  "Castle": 15,
  [__REST__]: 10,
};

const CUSTOM_VANTAGE_POINT_RETRIEVAL_FUNCS = {
  "Castle": () => {
    // help me
    let blocks = getBlocks(0, "minecraft:torch");
    if (!blocks.length) blocks = getBlocks(1, "minecraft:torch");
    if (!blocks.length) blocks = getBlocks(-1, "minecraft:torch");
    if (!blocks.length) blocks = getBlocks(-2, "minecraft:torch");
    const player = Player.getPlayer();
    const zAxes = new Set();
    const xAxis = Math.max(...blocks.map((block) => block.getX()));
    for (const block of blocks) zAxes.add(block.getZ());
    const block1 = World.getBlock(
      xAxis,
      blocks[0]?.getY(),
      [...zAxes].sort((a, b) => Math.abs(player.getZ() - a) - Math.abs(player.getZ() - b))[0]
    );
    const block2 = World.getBlock(
      xAxis,
      blocks[0]?.getY(),
      [...zAxes].sort((a, b) => Math.abs(player.getZ() - b) - Math.abs(player.getZ() - a))[0]
    );
    return {
      [block1.getZ() === Math.max(...zAxes) ? "south" : "north"]: [block1.getX() - 2, block1.getY(), block1.getZ()],
      [block2.getZ() === Math.max(...zAxes) ? "south" : "north"]: [block2.getX() - 2, block2.getY(), block2.getZ()],
    };
  },
};

const VANTAGE_POINT_ORIENTATIONS = {
  north: [0, 0],
  east: [90, 0],
  south: [-180, 0],
  west: [-90, 0],
};

const DROP_HOLE_OFFSETS = {
  corners: [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ],
  edges: [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
};

const MIN_MOVEMENT_PER_TICK = 0.21;

const baseAPI = Java.type("baritone.api.BaritoneAPI");
const baritoneGoalBlock = Java.type("baritone.api.pathing.goals.GoalBlock");
const primaryBaritone = baseAPI.getProvider().getPrimaryBaritone();
const baritoneSettings = baseAPI.getSettings();
const baritoneGoalProcess = primaryBaritone.getCustomGoalProcess();
const baritoneCommandMan = primaryBaritone.getCommandManager();
let currentBaritoneGoalBlock = null;

const distanceFrom = (target) => {
  const player = Player.getPlayer();
  return Math.round(
    Math.sqrt(
      Math.pow(target.getX() - player.getX(), 2) +
        Math.pow(target.getY() - player.getY(), 2) +
        Math.pow(target.getZ() - player.getZ(), 2)
    )
  );
};

const isNotAir = (block) => block.getId() !== "minecraft:air";

const countNonAirNeighbours = (block) =>
  ["north", "south", "east", "west"].map((dir) => isNotAir(World.getBlock(block.getBlockPos()[dir]()))).filter(Boolean)
    .length;

const getBlocks = (yOffset, blockId = "minecraft:air") => {
  const foundBlocks = [];
  const player = Player.getPlayer();
  const scanDistance = ABSOLUTE_CENTER_SCAN_DISTANCE[getMapInfo().active] ?? ABSOLUTE_CENTER_SCAN_DISTANCE[__REST__];
  const [x, y, z] = [Math.floor(player.getX()), Math.floor(player.getY()) + yOffset, Math.floor(player.getZ())];
  for (let dx = x - scanDistance; dx <= x + scanDistance; dx++) {
    for (let dz = z - scanDistance; dz <= z + scanDistance; dz++) {
      const block = World.getBlock(dx, y, dz);
      if (block.getId() === blockId) {
        foundBlocks.push(block);
      }
    }
  }
  return foundBlocks;
};

const getAbsoluteCenter = (yLevel = -1) => {
  const airBlocks = getBlocks(yLevel);
  const requiredNonAirNeighbours =
    ABSOLUTE_CENTER_NONAIR_NEIGHBOURS[getMapInfo().active] ?? ABSOLUTE_CENTER_NONAIR_NEIGHBOURS[__REST__];

  let candidate = null;
  for (const block of airBlocks) {
    const [x, y, z] = [block.getX(), block.getY(), block.getZ()];
    let validCorners = 0;
    for (const cornerOffset of DROP_HOLE_OFFSETS.corners) {
      const block = World.getBlock(x + cornerOffset[0], y, z + cornerOffset[1]);
      if (countNonAirNeighbours(block) === requiredNonAirNeighbours.corners) validCorners++;
    }
    if (validCorners !== 4) continue;

    let validEdges = 0;
    for (const edgeOffset of DROP_HOLE_OFFSETS.edges) {
      const block = World.getBlock(x + edgeOffset[0], y, z + edgeOffset[1]);
      if (countNonAirNeighbours(block) === requiredNonAirNeighbours.edges) validEdges++;
    }
    if (validEdges !== 4) continue;

    candidate = block;
  }

  // player may be jumping or on a slab, so check the y levels above and below them
  if (!candidate) return yLevel === -1 ? getAbsoluteCenter(-2) : yLevel === -2 ? getAbsoluteCenter(0) : candidate;
  return [candidate.getX(), candidate.getY() + 1, candidate.getZ()];
};

const getVantagePoints = () => {
  const activeMap = getMapInfo().active;
  if (CUSTOM_VANTAGE_POINT_RETRIEVAL_FUNCS[activeMap]) {
    return CUSTOM_VANTAGE_POINT_RETRIEVAL_FUNCS[activeMap]();
  }
  const absoluteCenter = getAbsoluteCenter();
  if (!absoluteCenter) return null;

  return Object.fromEntries(
    Object.entries(getVantagePointOffsets()).map(([dir, offset]) => [
      dir,
      [absoluteCenter[0] + offset[0], absoluteCenter[1] + offset[1], absoluteCenter[2] + offset[2]],
    ])
  );
};

const goToVantagePoint = (callback = null, customVantagePoint = null) => {
  const vantagePoints = getVantagePoints();
  const player = Player.getPlayer();
  if (!vantagePoints) {
    log("Cannot find vantage points", 0xc);
    return false;
  }
  let dir;
  let x, y, z;
  if (!customVantagePoint) {
    closest = Object.entries(vantagePoints).sort(
      (a, b) => distanceFrom(World.getBlock(...a[1])) - distanceFrom(World.getBlock(...b[1]))
    )[0];
    dir = closest[0];
    [x, y, z] = closest[1];
  } else {
    dir = customVantagePoint[0];
    [x, y, z] = customVantagePoint[1];
  }

  const activeMap = getMapInfo().active;
  currentBaritoneGoalBlock = new baritoneGoalBlock(
    x,
    VANTAGE_POINT_OFFSET_MAP[activeMap]?.[dir]?.[1] === -1 ? y + 1 : y, // baritone pathing fix
    z
  );
  baritoneGoalProcess.setGoalAndPath(currentBaritoneGoalBlock);

  waitForGoalBlockArrivalAsync(() => {
    alignInCenterOfBlock();
    player.lookAt(...VANTAGE_POINT_ORIENTATIONS[dir]);
    callback?.();
  }, dir);

  return true;
};

const getAlignmentInfo = () => {
  const player = Player.getPlayer();
  const [x, z] = [player.getX(), player.getZ()];
  const [cx, cz] = [Math.floor(x) + 0.5, Math.floor(z) + 0.5];
  const [tx, tz] = [
    Math.floor(Math.abs(cx - x) / MIN_MOVEMENT_PER_TICK),
    Math.floor(Math.abs(cz - z) / MIN_MOVEMENT_PER_TICK),
  ];
  return { tx, tz, txDir: cx > x ? "east" : "west", tzDir: cz > z ? "south" : "north" };
};

const requiresAlignment = () => {
  const { tx, tz } = getAlignmentInfo();
  return tx || tz;
};

const step = () => {
  KeyBind.keyBind("key.forward", true);
  Client.waitTick(1);
  KeyBind.keyBind("key.forward", false);
  Client.waitTick(3);
};

const alignInCenterOfBlock = () => {
  const { tx, tz, txDir, tzDir } = getAlignmentInfo();
  const player = Player.getPlayer();

  if (tx) {
    player.lookAt(txDir);
    for (let i = 0; i < tx; i++) step();
  }

  if (tz) {
    player.lookAt(tzDir);
    for (let i = 0; i < tz; i++) step();
  }
};

const getFlooredPlayerPos = (addOneToY = false) => {
  const player = Player.getPlayer();
  return [Math.floor(player.getX()), Math.floor(player.getY()) + Number(addOneToY), Math.floor(player.getZ())];
};

const waitForGoalBlockArrivalAsync = (callback, dir) => {
  JavaWrapper.methodToJavaAsync(() => {
    let callbackCalled = false;

    while (!callbackCalled) {
      JavaWrapper.methodToJavaAsync(() => {
        if (
          currentBaritoneGoalBlock &&
          currentBaritoneGoalBlock.isInGoal(
            ...getFlooredPlayerPos(VANTAGE_POINT_OFFSET_MAP[getMapInfo().active]?.[dir]?.[1] === -1)
          )
        ) {
          currentBaritoneGoalBlock = null;

          Client.waitTick(3);
          callback();
          callbackCalled = true;
        }
      }).run();
      Client.waitTick(1);
    }
  }).run();
};

const getPlayerVantagePoint = () => {
  const vantagePoints = getVantagePoints();
  const playerPos = JSON.stringify(getFlooredPlayerPos());
  let direction = null;
  for (const [dir, pos] of Object.entries(vantagePoints)) {
    if (playerPos === JSON.stringify(pos)) {
      direction = dir;
      break;
    }
  }
  return direction;
};

const isInVantagePoint = () => {
  const vantagePoints = getVantagePoints();
  if (!vantagePoints) return false;
  const playerPos = JSON.stringify(getFlooredPlayerPos());
  return Object.values(vantagePoints).some((pos) => JSON.stringify(pos) === playerPos);
};

const findNextClosestVantagePointWithMacrosSaved = (map, invalidVantagePoint) => {
  const availableMacros = [...(FS.list(`macros/${map}`) ?? [])].map((val) => val.split(".")[0]);
  const vantagePoints = getVantagePoints();
  if (!vantagePoints) return null;
  return Object.entries(vantagePoints)
    .filter(([dir]) => dir !== invalidVantagePoint && availableMacros.includes(dir))
    .sort((a, b) => distanceFrom(World.getBlock(...a[1])) - distanceFrom(World.getBlock(...b[1])))[0];
};

module.exports = {
  getPlayerVantagePoint,
  goToVantagePoint,
  VANTAGE_POINT_ORIENTATIONS,
  requiresAlignment,
  alignInCenterOfBlock,
  isInVantagePoint,
  findNextClosestVantagePointWithMacrosSaved,
  baritoneSettings,
};
