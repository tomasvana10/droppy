class ShallowJSON {
  static FILE;
  static LOCAL;
  static _DEFAULTS;
  static _READ_ERR;
  static _INDENT;

  static initLocal() {
    for (const [k, v] of Object.entries(this._read())) {
      this.LOCAL[k] = v;
    }
  }

  static _read(r = true) {
    try {
      return JSON.parse(FS.open(this.FILE).read());
    } catch {
      if (r) {
        this._write(this._DEFAULTS);
        return this._read(false);
      } else {
        throw new Error(this._READ_ERR);
      }
    }
  }

  static _write(data) {
    FS.open(this.FILE).write(JSON.stringify(data, null, this._INDENT));
  }

  static set(k, v) {
    this._write({ ...this._read(), [k]: v });
    this.LOCAL[k] = v;
  }

  static get(k) {
    return this._read()[k];
  }
}

class Config extends ShallowJSON {
  static FILE = "droppy.json";
  static LOCAL = {};
  static _DEFAULTS = {
    autoPlay: true,
    autoJump: true,
    preJump: true,
    verbose: false,
  };
  static _READ_ERR = "Cannot get config file";
  static _INDENT = 2;
}

module.exports = { Config };
