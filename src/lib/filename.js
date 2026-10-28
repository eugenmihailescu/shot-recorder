export function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatShotName(date, settings, extension) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  let hour = date.getHours();
  let suffix = "";
  if (settings.hourClock === "12") {
    suffix = hour >= 12 ? "pm" : "am";
    hour %= 12;
    if (hour === 0) hour = 12;
  }
  const clock = `${pad(hour)}${pad(date.getMinutes())}${pad(date.getSeconds())}${suffix}`;
  const order = settings.dateOrder;
  const datePart = order === "dmy"
    ? `${day}${month}${year}`
    : order === "mdy"
      ? `${month}${day}${year}`
      : `${year}${month}${day}`;
  return `shot-${datePart}-${clock}.${extension}`;
}

export function formatRecordingName(date, settings, extension) {
  return formatShotName(date, settings, extension).replace(/^shot-/, "recording-");
}

export function sanitizeDirectory(name) {
  const clean = String(name || "")
    .replace(/[^A-Za-z0-9/_-]/g, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
  return clean || "ShotRecorder";
}

export function imageExtension(settings) {
  return settings.imageType === "jpeg" ? "jpg" : "png";
}
