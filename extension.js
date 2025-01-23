import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Shell from "gi://Shell";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";

import * as Util from "resource:///org/gnome/shell/misc/util.js";
const Mainloop = imports.mainloop;

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

const LIMIT = 80;
const ANNOYING_POPUP_LIMIT = 95;
const INTERVAL = 5;
const COMMAND = `/bin/sh -c "LANG=C df ~ | tail -n1"`;

const QuotaMonitor = GObject.registerClass(
  class QuotaMonitor extends PanelMenu.Button {
    _init() {
      super._init(0.0, "QuotaMonitor");

      this.connect("button-press-event", this._openBaobab.bind(this));
      this._initUI();

      this.timer = Mainloop.timeout_add_seconds(
        INTERVAL,
        this._refresh.bind(this),
      );
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
      if (this.timer) {
        Mainloop.source_remove(this.timer);
        this.timer = null;
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

    _refresh() {
      const [_in, out, _err] = GLib.spawn_command_line_sync(COMMAND);
      const quota = new TextDecoder().decode(out).trim().split(/\s+/);

      const current = Number.parseInt(quota[2]);
      const maximum = Number.parseInt(quota[1]);
      const percent = Math.round((100 * current) / maximum);

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

      if (this.timer) {
        Mainloop.source_remove(this.timer);
        this.timer = null;

        if (percent >= ANNOYING_POPUP_LIMIT) {
          this.notified = false;
        }
      }

      this.timer = Mainloop.timeout_add_seconds(
        INTERVAL,
        this._refresh.bind(this),
      );
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
