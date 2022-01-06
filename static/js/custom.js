document.onload = setCookie();
function setCookie() {
    const cookies = document.getElementById("cookies");
    const cookiesBtn = document.getElementById("cookies-btn");
    if (!document.cookie) {
        cookies.style.display = "block";
    }
    cookiesBtn.onclick = function () {
        date = new Date();
        let expr = date.setDate(date.getDate() + 1);
        document.cookie = "cookies=14; expires=$expr";
        cookies.style.display = "none";
    }
}