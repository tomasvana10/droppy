class Config {
  static CONFIG = "droppy.json";
  static _DEFAULT = {
    autoPlay: true,
    autoJump: true,
    preJump: true,
    verbose: false,
  };
  static LOCAL = {};

  static initLocal() {
    for (const [k, v] of Object.entries(Config._read())) {
      Config.LOCAL[k] = v;
    }
  }

  static _write(cfg) {
    FS.open(Config.CONFIG).write(JSON.stringify(cfg, null, 2));
  }

  static _read(r = true) {
    try {
      return JSON.parse(FS.open(Config.CONFIG).read());
    } catch {
      if (r) {
        Config._write(Config._DEFAULT);
        return Config._read(false);
      } else {
        throw new Error("Cannot get config file.");
      }
    }
  }

  static set(k, v) {
    Config._write({ ...Config._read(), [k]: v });
    Config.LOCAL[k] = v;
  }

  static get(k) {
    return Config._read()[k];
  }
}

module.exports = { Config };
