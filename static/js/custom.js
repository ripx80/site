document.onload = setCookie();
function setCookie() {
    console.log("setcookie exec")
    const cookies = document.getElementById("cookies");
    const cookiesBtn = document.getElementById("cookies-btn");
    if (!document.cookie) {
        console.log("no cookie found")
        cookies.style.display = "block";
    }
    cookiesBtn.onclick = function () {
        console.log("onclick btn")
        date = new Date();
        let expr = date.setDate(date.getDate() + 1);
        document.cookie = "cookies=14; expires=$expr";
        cookies.style.display = "none";
    }
}