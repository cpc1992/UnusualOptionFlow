//color calls green and puts red
let rows = document.querySelectorAll('.allEntries tbody tr');
let green = '#006f3c';
let red = '#bf212f';
for (let i = 0; i < rows.length; i++) {

    if (rows[i].classList.contains('Call')) {
        rows[i].children[3].style.color = green;
        rows[i].children[5].style.color = green;
        rows[i].children[11].style.color = green;

    } else {
        rows[i].children[3].style.color = red;
        rows[i].children[5].style.color = red;
        rows[i].children[11].style.color = red;
    }
}

let maprows = document.querySelectorAll('.mapEntries tbody tr');

for (let i = 0; i < maprows.length; i++) {

    if (maprows[i].classList.contains('callHeavy')) {
        maprows[i].children[2].style.color = green;
        maprows[i].children[2].style.fontWeight = 'bold';
        maprows[i].children[3].style.color = green;
        maprows[i].children[3].style.fontWeight = 'bold';

    } else if (maprows[i].classList.contains('putHeavy')) {
        maprows[i].children[4].style.color = red;
        maprows[i].children[4].style.fontWeight = 'bold';
        maprows[i].children[5].style.color = red;
        maprows[i].children[5].style.fontWeight = 'bold';
    }
}