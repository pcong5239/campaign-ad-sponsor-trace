const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function showProviderError(element, error) {
  element.textContent = error?.message || "The selected wallet did not connect. Choose a provider and approve the request.";
}

export function setupProviderDialog({ dialog, trigger, closeButton, backgrounds, beforeOpen }) {
  const close = () => dialog.close();
  const open = () => {
    beforeOpen();
    backgrounds.forEach((element) => { element.inert = true; });
    dialog.showModal();
    closeButton.focus();
  };
  const backdrop = (event) => { if (event.target === dialog) close(); };
  const cancel = (event) => {
    event.preventDefault();
    close();
  };
  const keydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll(FOCUSABLE)];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && dialog.ownerDocument.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && dialog.ownerDocument.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const restore = () => {
    backgrounds.forEach((element) => { element.inert = false; });
    trigger.focus();
  };

  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  dialog.addEventListener("click", backdrop);
  dialog.addEventListener("cancel", cancel);
  dialog.addEventListener("keydown", keydown);
  dialog.addEventListener("close", restore);

  return {
    open,
    stop() {
      trigger.removeEventListener("click", open);
      closeButton.removeEventListener("click", close);
      dialog.removeEventListener("click", backdrop);
      dialog.removeEventListener("cancel", cancel);
      dialog.removeEventListener("keydown", keydown);
      dialog.removeEventListener("close", restore);
    },
  };
}
