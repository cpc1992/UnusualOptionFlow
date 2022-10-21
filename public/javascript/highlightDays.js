
let dateHolder = rows[0].children[1].innerText;
let highlight = ['bg-selectedlite', 'bg-highlight2'];
let flipper = 0;

for (let i = 0; i < rows.length; i++) {
    if (rows[i].children[1].innerText == dateHolder) {
        rows[i].classList.add(highlight[flipper]);
    } else {
        flipper = 1 - flipper;
        dateHolder = rows[i].children[1].innerText;
        rows[i].classList.add(highlight[flipper]);


    }
}