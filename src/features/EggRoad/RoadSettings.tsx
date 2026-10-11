import { useId } from "react";
import { copy } from "./copy.ts";
import type { GyroState } from "./camera.ts";
import type { RoadPreferences } from "./preferences.ts";

function SettingSwitch({ label, hint, checked, pending = false, onToggle, onLabel, offLabel }: {
  label: string; hint?: string; checked: boolean; pending?: boolean; onToggle: () => void; onLabel: string; offLabel: string;
}) {
  const id = useId();
  return <button type="button" className="egg-road-setting-switch" role="switch" aria-checked={checked}
    aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} aria-busy={pending || undefined} onClick={onToggle}>
    <span className="egg-road-setting-copy"><span id={`${id}-label`}>{label}</span>{hint && <small id={`${id}-hint`}>{hint}</small>}</span>
    <span className="egg-road-setting-state" aria-hidden="true"><span>{pending ? "…" : checked ? onLabel : offLabel}</span><span className="egg-road-switch" /></span>
  </button>;
}

export function RoadSettings({ lang, preferences, onPreferences, mobile, orientation, onOrientation, gyro, onGyro, calibrated, onCalibrate }: {
  lang: "ru" | "en"; preferences: RoadPreferences; onPreferences: (patch: Partial<RoadPreferences>) => void;
  mobile: boolean; orientation: "portrait" | "landscape"; onOrientation: () => void;
  gyro: GyroState; onGyro: () => void; calibrated: boolean; onCalibrate: () => void;
}) {
  const ui = copy[lang], stateLabels = { onLabel: ui.settingOn, offLabel: ui.settingOff };
  const id = useId();
  return <details className="egg-road-help egg-road-settings"><summary>{ui.settings}</summary><div className="egg-road-options">
    <label className="egg-road-setting-select"><span id={`${id}-quality`}>{ui.quality}</span>
      <select aria-labelledby={`${id}-quality`} value={preferences.quality} onChange={event => onPreferences({ quality: event.target.value as RoadPreferences["quality"] })}>
        <option value="auto">{ui.qualityAuto}</option><option value="low">{ui.qualityLow}</option><option value="high">{ui.qualityHigh}</option>
      </select>
    </label>
    {mobile && <label className="egg-road-setting-select"><span id={`${id}-orientation`}>{ui.screenOrientation}</span>
      <select aria-labelledby={`${id}-orientation`} value={orientation} onChange={event => { if (event.target.value !== orientation) onOrientation(); }}>
        <option value="landscape">{ui.orientationLandscape}</option><option value="portrait">{ui.orientationPortrait}</option>
      </select>
    </label>}
    <SettingSwitch label={ui.sound} checked={!preferences.muted} onToggle={() => onPreferences({ muted: !preferences.muted })} {...stateLabels} />
    <SettingSwitch label={ui.landingGuide} hint={ui.landingGuideHint} checked={preferences.landingGuide} onToggle={() => onPreferences({ landingGuide: !preferences.landingGuide })} {...stateLabels} />
    <SettingSwitch label={ui.ghost} hint={ui.ghostHint} checked={preferences.ghost} onToggle={() => onPreferences({ ghost: !preferences.ghost })} {...stateLabels} />
    <SettingSwitch label={ui.haptics} checked={preferences.haptics} onToggle={() => onPreferences({ haptics: !preferences.haptics })} {...stateLabels} />
    <SettingSwitch label={ui.leftHanded} checked={preferences.leftHanded} onToggle={() => onPreferences({ leftHanded: !preferences.leftHanded })} {...stateLabels} />
    <SettingSwitch label={ui.gyroSetting} hint={ui.gyroHint} checked={gyro === "on" || gyro === "waiting"} pending={gyro === "waiting"} onToggle={onGyro} {...stateLabels} />
    {gyro === "waiting" && <p role="status">{ui.gyroWaiting}</p>}
    {gyro === "unavailable" && <p role="status">{ui.gyroMissing}</p>}
    {gyro === "on" && <div className="egg-road-setting-calibration"><button type="button" onClick={onCalibrate}>{calibrated ? ui.calibrated : ui.calibrate}</button><p>{ui.tiltNote}</p></div>}
  </div></details>;
}
