const params = new URLSearchParams(location.search);
document.querySelector("#text").textContent = params.get("text") || "Something went wrong.";
document.querySelector("#close").addEventListener("click", () => window.close());
