function saveTask() {
    const title = $("txtTitle").val(); 
    const description = $("descriptionInput").val();
    const color = $("selCol").val();
    const date = $("dateTimeLocal").val();
    const status = $("selStatus").val();
    const budget = $("numBudget").val();
}

function init() {
    console.log("init")
    // hook up event listeners
    $("#btnSave".click("saveTask"));
}
window.onload = init;