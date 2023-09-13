

//handle clicked rows
let clickedElement = null;
let clickedRow = document.querySelectorAll('.mapEntries tbody tr');

for (let i = 0; i < clickedRow.length; i++) {
    clickedRow[i].addEventListener('click', (e) => {

        //unhighlight anything highlighted 
        let currentlyHighlighted = document.querySelectorAll(".bg-selected");
        for (let i = 0; i < currentlyHighlighted.length; i++) {
            currentlyHighlighted[i].classList.remove('bg-selected');
        }

        //highlight the clicked row
        clickedElement = clickedRow[i];
        clickedRow[i].classList.add("bg-selected");

        //highlight the related rows
        let ticker = clickedRow[i].children[1].innerText;
        let relatedRows = document.querySelectorAll(`.allEntries tbody tr.${ticker}`);
        for (let i = 0; i < relatedRows.length; i++) {
            relatedRows[i].classList.add("bg-selected");
        }
    });
}

window.addEventListener('click', function (e) {
    if (clickedElement != null) {
        if (!clickedElement.contains(e.target)) {
            let currentlyHighlighted = document.querySelectorAll(".bg-selected");
            for (let i = 0; i < currentlyHighlighted.length; i++) {
                currentlyHighlighted[i].classList.remove('bg-selected');
            }
            clickedElement = null;
        }
    }
});





