const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SETTINGS_KEY = "dgddgd314.post-editor.drive-image-settings.v1";
const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";

type DriveSettings = {
  clientId: string;
  folderId: string;
};

type GoogleTokenClient = {
  requestAccessToken: (config?: { prompt?: string }) => void;
};

type GoogleAccounts = {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: { access_token?: string; error?: string }) => void;
    }) => GoogleTokenClient;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

let scriptPromise: Promise<void> | null = null;
let accessToken = "";

function getSettings(): DriveSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<DriveSettings>;
    return {
      clientId: typeof value.clientId === "string" ? value.clientId : "",
      folderId: typeof value.folderId === "string" ? value.folderId : "",
    };
  } catch {
    return { clientId: "", folderId: "" };
  }
}

function saveSettings(settings: DriveSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  accessToken = "";
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services could not be loaded."));
    document.head.append(script);
  });
  return scriptPromise;
}

async function getAccessToken(settings: DriveSettings): Promise<string> {
  if (accessToken) return accessToken;
  await loadGoogleIdentityServices();
  if (!window.google?.accounts.oauth2) throw new Error("Google sign-in is unavailable.");

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: settings.clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Google authorization was cancelled."));
          return;
        }
        accessToken = response.access_token;
        resolve(accessToken);
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

async function driveRequest(path: string, token: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (response.status === 401) accessToken = "";
  if (!response.ok) throw new Error(`Drive request failed (${response.status}).`);
  return response;
}

async function uploadToDrive(file: File, settings: DriveSettings): Promise<string> {
  const token = await getAccessToken(settings);
  const metadataResponse = await driveRequest("/files?fields=id", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", parents: [settings.folderId] }),
  });
  const { id } = await metadataResponse.json() as { id?: string };
  if (!id) throw new Error("Drive did not return an uploaded file ID.");

  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Drive upload failed (${response.status}).`);
  });

  await driveRequest(`/files/${id}/permissions?sendNotificationEmail=false`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader" }),
  });

  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => { toast.hidden = true; }, 2600);
}

function ensureDialog(): HTMLDialogElement {
  const existing = document.querySelector<HTMLDialogElement>("[data-drive-settings-dialog]");
  if (existing) return existing;
  const dialog = document.createElement("dialog");
  dialog.className = "drive-settings-dialog";
  dialog.dataset.driveSettingsDialog = "";
  dialog.innerHTML = `
    <form method="dialog" class="drive-settings-dialog__form">
      <h2>Google Drive image upload</h2>
      <p>Only this browser stores these values. The client ID is public; never enter a client secret.</p>
      <label>OAuth client ID<input name="clientId" required placeholder="...apps.googleusercontent.com" /></label>
      <label>Shared folder ID<input name="folderId" required placeholder="Google Drive folder ID" /></label>
      <p class="drive-settings-dialog__help">Enable the Google Drive API and add this site origin to the OAuth client in Google Cloud.</p>
      <menu><button value="cancel">Cancel</button><button value="save">Save</button></menu>
    </form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => {
    if (dialog.returnValue !== "save") return;
    const form = dialog.querySelector<HTMLFormElement>("form");
    const clientId = new FormData(form ?? undefined).get("clientId")?.toString().trim() ?? "";
    const folderId = new FormData(form ?? undefined).get("folderId")?.toString().trim() ?? "";
    if (!clientId || !folderId) return;
    saveSettings({ clientId, folderId });
    showToast("Google Drive settings saved.");
  });
  return dialog;
}

function openSettings(): void {
  const dialog = ensureDialog();
  const settings = getSettings();
  const form = dialog.querySelector<HTMLFormElement>("form");
  const clientId = form?.elements.namedItem("clientId") as HTMLInputElement | null;
  const folderId = form?.elements.namedItem("folderId") as HTMLInputElement | null;
  if (clientId) clientId.value = settings.clientId;
  if (folderId) folderId.value = settings.folderId;
  dialog.showModal();
}

function installImageControls(): void {
  document.querySelectorAll<HTMLElement>(".editor-block--image").forEach((block) => {
    if (block.querySelector("[data-drive-image-upload]")) return;
    const controls = document.createElement("div");
    controls.className = "drive-image-upload";
    controls.innerHTML = `
      <button type="button" data-drive-image-upload>Upload to Drive</button>
      <button type="button" data-drive-image-settings>Drive settings</button>
      <input type="file" data-drive-image-file accept="image/*" hidden />`;
    block.append(controls);

    const picker = controls.querySelector<HTMLInputElement>("[data-drive-image-file]");
    controls.querySelector<HTMLButtonElement>("[data-drive-image-settings]")?.addEventListener("click", openSettings);
    controls.querySelector<HTMLButtonElement>("[data-drive-image-upload]")?.addEventListener("click", () => {
      const settings = getSettings();
      if (!settings.clientId || !settings.folderId) {
        openSettings();
        return;
      }
      picker?.click();
    });
    picker?.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const uploadButton = controls.querySelector<HTMLButtonElement>("[data-drive-image-upload]");
      if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.textContent = "Uploading...";
      }
      try {
        const src = await uploadToDrive(file, getSettings());
        const input = block.querySelector<HTMLInputElement>('input[data-field="src"]');
        if (!input) throw new Error("Image URL field was not found.");
        input.value = src;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        showToast("Image uploaded to Google Drive.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Drive upload failed.");
      } finally {
        picker.value = "";
        if (uploadButton) {
          uploadButton.disabled = false;
          uploadButton.textContent = "Upload to Drive";
        }
      }
    });
  });
}

export function initDriveImageUpload(): void {
  installImageControls();
  new MutationObserver(installImageControls).observe(document.body, { childList: true, subtree: true });
}
