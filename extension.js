import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import * as Util from "resource:///org/gnome/shell/misc/util.js";
import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

const LIMIT = 80;
const ANNOYING_POPUP_LIMIT = 95;
const INTERVAL = 5;
const COMMAND_QUOTA = `LANG=C df ~ | tail -n1`;
const COMMAND_HOME_SIZE = `du -s ~ | tail -n1`;

const QuotaMonitor = GObject.registerClass(
  class QuotaMonitor extends PanelMenu.Button {
    _init() {
      super._init(0.0, "QuotaMonitor");
      this.connect("button-press-event", this._openBaobab.bind(this));
      this._initUI();
      this._refresh();
    }

    _initUI() {
      this.box = new St.BoxLayout();
      this.icon = new St.Icon({
        icon_name: "drive-harddisk-symbolic",
        style_class: "system-status-icon",
      });
      this.percentage = new St.Label({
        text: "0%",
        style_class: "item",
      });
      this.box.add_child(this.icon);
      this.box.add_child(this.percentage);
      this.add_child(this.box);
    }

    destroy() {
      if (this._timeoutId) {
        GLib.Source.remove(this._timeoutId);
        this._timeoutId = null;
      }
      super.destroy();
    }

    _openBaobab() {
      const app = Shell.AppSystem.get_default().lookup_app(
        "org.gnome.baobab.desktop",
      );
      if (app) {
        app.activate();
      } else {
        Util.spawn(["baobab", GLib.get_home_dir()]);
      }
    }

    async _refresh() {
      try {
        const quota = await this._execCommand(COMMAND_QUOTA);
        const quotaData = quota.trim().split(/\s+/);

        const homeSizeOutput = await this._execCommand(COMMAND_HOME_SIZE);
        const current_home_size = homeSizeOutput.trim().split(/\s+/)[0];

        const current = Number.parseInt(current_home_size);
        const maximum = Number.parseInt(quotaData[1]);
        const percent = Math.round((100 * current) / maximum);

        log(
          `QuotaMonitor: current=${current} KB, maximum=${maximum} KB, percent=${percent}%`,
        );

        this.percentage.set_text(`${percent}%`);

        if (percent >= LIMIT && !this.notified) {
          this.notified = true;
          notify(
            _("Quota Alert"),
            _("You are almost over your disk quota! Delete some files now."),
            "drive-harddisk-symbolic",
          );
        }

        if (percent < LIMIT && this.notified) {
          this.notified = false;
        }

        if (percent >= ANNOYING_POPUP_LIMIT) {
          this.notified = false;
        }
      } catch (e) {
        logError(e, "QuotaMonitor refresh error");
      }

      this._timeoutId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        INTERVAL,
        () => {
          this._refresh();
          return GLib.SOURCE_REMOVE;
        },
      );
    }

    _execCommand(command) {
      return new Promise((resolve, reject) => {
        let proc;
        try {
          const argv = ["/bin/sh", "-c", command];
          // STDOUT_PIPE = 2, STDERR_PIPE = 4
          const flags = 2 | 4;

          proc = new Gio.Subprocess({
            argv: argv,
            flags: flags,
          });
          proc.init(null);
        } catch (e) {
          reject(e);
          return;
        }

        proc.communicate_utf8_async(null, null, (sourceObject, res) => {
          try {
            const [, stdout, stderr] =
              sourceObject.communicate_utf8_finish(res);
            if (sourceObject.get_successful()) {
              resolve(stdout);
            } else {
              reject(new Error(stderr || "Command failed"));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
    }
  },
);

const notify = (msg, details, icon) => {
  const source = new MessageTray.Source({
    title: msg,
    iconName: icon,
  });
  Main.messageTray.add(source);

  const notification = new MessageTray.Notification({
    source: source,
    title: msg,
    body: details,
    iconName: icon,
    urgency: MessageTray.Urgency.HIGH,
  });
  source.addNotification(notification);
};

export default class QuotaMonitorExtension extends Extension {
  enable() {
    this.quotaMonitorIndicator = new QuotaMonitor();
    Main.panel.addToStatusArea(this.metadata.uuid, this.quotaMonitorIndicator);
  }

  disable() {
    this.quotaMonitorIndicator.destroy();
    this.quotaMonitorIndicator = null;
  }
}

/* vim:set sw=2 ts=2 et: */
