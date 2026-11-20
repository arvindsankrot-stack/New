// Confirmation prompts for forms marked data-confirm (no inline JS, CSP friendly).
document.addEventListener("submit", function (e) {
  var form = e.target;
  var msg = form.getAttribute("data-confirm");
  if (msg && !window.confirm(msg)) {
    e.preventDefault();
  }
});

// Copy-to-clipboard buttons: <button data-copy="#element-id">
document.addEventListener("click", function (e) {
  var btn = e.target.closest("[data-copy]");
  if (!btn) return;
  var el = document.querySelector(btn.getAttribute("data-copy"));
  if (!el) return;
  navigator.clipboard.writeText(el.value || el.textContent).then(function () {
    var old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(function () { btn.textContent = old; }, 1500);
  });
});
