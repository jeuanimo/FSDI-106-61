const paragraph = document.getElementById("demo");
const button = document.getElementById("myBtn");
const resultDiv = document.getElementById("result");
console.log("paragraph 1", paragraph);
console.log("button 1", button);







button.addEventListener("click", function () {
    paragraph.innerText = "This is the NEW message";
    resultDiv.innerText = "Button was clicked!";
    resultDiv.style.color = "blue";
    resultDiv.style.fontWeight = "bold";
});



// Wait for the page to load before running init
