// ========================================
// MM2 SHOP
// Покупка + Telegram + Roblox ник
// ========================================


// ПЛАВНАЯ ПРОКРУТКА
document.querySelectorAll('a[href^="#"]').forEach(link => {

    link.addEventListener("click", function(e) {

        const target = document.querySelector(
            this.getAttribute("href")
        );

        if (!target) return;

        e.preventDefault();

        target.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    });

});


// ========================================
// АНИМАЦИИ ПРИ ПОЯВЛЕНИИ
// ========================================

const animatedElements = document.querySelectorAll(
    ".product, .feature, .contact-box, .section-title"
);

if ("IntersectionObserver" in window) {

    const observer = new IntersectionObserver(
        entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("show");

                }

            });

        },
        {
            threshold: 0.12
        }
    );

    animatedElements.forEach(element => {

        observer.observe(element);

    });

}


// ========================================
// ЮMONEY
// ========================================

const payments = {

    bioblade: {

        product: "BioBlade",

        price: "39 ₽",

        iframe:
        '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9FVEM9TP2.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'

    },


    raygun: {

        product: "Raygun",

        price: "399 ₽",

        iframe:
        '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9FUT67CF8.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'

    },


    traveler: {

        product: "Traveler's Gun",

        price: "8 999 ₽",

        iframe:
        '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9FVP7RJJ0.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'

    },


    harvester: {

        product: "Harvester",

        price: "299 ₽",

        iframe:
        '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9G026LUUD.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'

    }

};


// ========================================
// ТЕКУЩИЙ ЗАКАЗ
// ========================================

let currentOrder = null;


// ========================================
// СОЗДАЁМ ОКНО ПОКУПКИ
// ========================================

const modal = document.createElement("div");

modal.className = "purchase-modal";


modal.innerHTML = `

    <div class="purchase-overlay"></div>

    <div class="purchase-window">

        <button
            class="close-purchase"
            aria-label="Закрыть"
        >
            ×
        </button>


        <div class="purchase-image-box">

            <img
                id="purchaseImage"
                src=""
                alt="Товар"
            >

        </div>


        <div class="purchase-rarity">
            MM2 ITEM
        </div>


        <h2 id="purchaseProduct">
            Товар
        </h2>


        <div class="purchase-price">

            <span>
                Цена
            </span>

            <strong id="purchasePrice">
                0 ₽
            </strong>

        </div>


        <!-- ДАННЫЕ ПОКУПАТЕЛЯ -->

        <div class="purchase-form">

            <label for="telegramUsername">
                👤 Юз в Telegram
            </label>

            <input
                id="telegramUsername"
                type="text"
                placeholder="@username"
                maxlength="50"
                autocomplete="off"
            >


            <label for="gameNickname">
                🎮 Ник в Roblox
            </label>

            <input
                id="gameNickname"
                type="text"
                placeholder="Ник в Roblox"
                maxlength="50"
                autocomplete="off"
            >

        </div>


        <!-- ОПЛАТА -->

        <div
            id="paymentArea"
            style="margin-top:18px"
        >

            <div
                style="
                    font-size:12px;
                    color:#bdbdbd;
                    font-weight:700;
                    margin-bottom:10px;
                "
            >
                💳 ОПЛАТА ЧЕРЕЗ ЮMONEY
            </div>


            <div
                id="paymentButton"
                style="
                    min-height:50px;
                    display:flex;
                    justify-content:center;
                    align-items:center;
                "
            ></div>


            <div
                style="
                    font-size:10px;
                    color:#777;
                    text-align:center;
                    margin-top:8px;
                "
            >
                После оплаты нажми «Оформить заказ».
            </div>

        </div>


        <button
            class="submit-purchase"
            id="submitPurchase"
        >
            ✅ Оформить заказ
        </button>


        <div
            id="orderError"
            style="
                display:none;
                margin-top:10px;
                color:#ff7070;
                font-size:14px;
                text-align:center;
            "
        ></div>


        <p class="purchase-note">

            🔒 Данные нужны для связи и передачи предмета.

        </p>

    </div>

`;


document.body.appendChild(modal);


// ========================================
// ЭЛЕМЕНТЫ
// ========================================

const purchaseImage =
    document.getElementById("purchaseImage");

const purchaseProduct =
    document.getElementById("purchaseProduct");

const purchasePrice =
    document.getElementById("purchasePrice");

const telegramUsername =
    document.getElementById("telegramUsername");

const gameNickname =
    document.getElementById("gameNickname");

const submitPurchase =
    document.getElementById("submitPurchase");

const paymentButton =
    document.getElementById("paymentButton");

const orderError =
    document.getElementById("orderError");


// ========================================
// ЗАКРЫТИЕ ОКНА
// ========================================

function closePurchaseModal() {

    modal.classList.remove("active");

    document.body.classList.remove("modal-open");

}


document
    .querySelector(".close-purchase")
    .addEventListener(
        "click",
        closePurchaseModal
    );


document
    .querySelector(".purchase-overlay")
    .addEventListener(
        "click",
        closePurchaseModal
    );


document.addEventListener(
    "keydown",
    e => {

        if (e.key === "Escape") {

            closePurchaseModal();

        }

    }
);


// ========================================
// КНОПКА КУПИТЬ
// ========================================

document.addEventListener(
    "click",
    e => {

        const buyButton =
            e.target.closest(".buy");

        if (!buyButton) return;

        e.preventDefault();


        const productCard =
            buyButton.closest(".product");


        const image =
            productCard
                ? productCard.querySelector(
                    ".product-image img"
                )
                : null;


        const payment =
            payments[
                buyButton.dataset.payment
            ];


        if (!payment) {

            console.error(
                "Платёж для товара не найден"
            );

            return;

        }


        currentOrder = {

            product: payment.product,

            price: payment.price,

            image:
                image
                    ? image.src
                    : "",

            payment: payment

        };


        purchaseProduct.textContent =
            currentOrder.product;


        purchasePrice.textContent =
            currentOrder.price;


        purchaseImage.src =
            currentOrder.image;


        // ВАЖНО:
        // каждый раз заново вставляем кнопку ЮMoney

        paymentButton.innerHTML =
            currentOrder.payment.iframe;


        telegramUsername.value = "";

        gameNickname.value = "";

        orderError.style.display =
            "none";

        orderError.textContent =
            "";


        modal.classList.add("active");

        document.body.classList.add(
            "modal-open"
        );


        setTimeout(() => {

            telegramUsername.focus();

        }, 200);

    }
);


// ========================================
// ПРОВЕРКА ПОЛЕЙ
// ========================================

function showError(message, input) {

    orderError.textContent =
        "❌ " + message;

    orderError.style.display =
        "block";


    if (input) {

        input.focus();

        input.classList.add(
            "input-error"
        );


        setTimeout(() => {

            input.classList.remove(
                "input-error"
            );

        }, 700);

    }

}


// ========================================
// ОФОРМЛЕНИЕ ЗАКАЗА
// ========================================

submitPurchase.addEventListener(
    "click",
    async () => {

        if (
            !currentOrder ||
            submitPurchase.disabled
        ) {

            return;

        }


        let telegram =
            telegramUsername.value.trim();


        const nickname =
            gameNickname.value.trim();


        // ПРОВЕРЯЕМ TELEGRAM

        if (!telegram) {

            showError(
                "Укажи юз в Telegram.",
                telegramUsername
            );

            return;

        }


        // ДОБАВЛЯЕМ @

        if (!telegram.startsWith("@")) {

            telegram =
                "@" + telegram;

        }


        // ПРОВЕРЯЕМ НИК

        if (!nickname) {

            showError(
                "Укажи ник в Roblox.",
                gameNickname
            );

            return;

        }


        // БЛОКИРУЕМ КНОПКУ

        submitPurchase.disabled =
            true;

        submitPurchase.textContent =
            "⏳ Отправляем заказ...";


        orderError.style.display =
            "none";


        // ДАННЫЕ, КОТОРЫЕ ПОЙДУТ НА СЕРВЕР

        const order = {

            product:
                currentOrder.product,

            price:
                currentOrder.price,

            telegram:
                telegram,

            nickname:
                nickname

        };


        try {

            const response =
                await fetch(
                    "/api/orders",
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(order)

                    }
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.error ||
                    "Не удалось создать заказ."
                );

            }


            // ЗАКАЗ УСПЕШНО СОХРАНЁН

            closePurchaseModal();


            showSuccess(
                data.order
            );


        } catch (error) {

            console.error(error);


            orderError.textContent =
                "❌ " +
                (
                    error.message ||
                    "Ошибка сервера."
                );


            orderError.style.display =
                "block";


        } finally {

            submitPurchase.disabled =
                false;

            submitPurchase.textContent =
                "✅ Оформить заказ";

        }

    }
);


// ========================================
// ENTER В ПОЛЯХ
// ========================================

[
    telegramUsername,
    gameNickname
].forEach(input => {

    input.addEventListener(
        "keydown",
        e => {

            if (e.key === "Enter") {

                submitPurchase.click();

            }

        }
    );

});


// ========================================
// УСПЕШНЫЙ ЗАКАЗ
// ========================================

function showSuccess(order) {

    const success =
        document.createElement("div");


    success.className =
        "success-modal active";


    success.innerHTML = `

        <div class="success-overlay"></div>


        <div class="success-window">

            <div class="success-icon">
                ✓
            </div>


            <div class="success-label">
                ЗАКАЗ ПРИНЯТ
            </div>


            <h2>
                Спасибо за заказ! 🎉
            </h2>


            <p class="success-main">
                Данные заказа отправлены владельцу.
            </p>


            <div class="success-details">

                <div>

                    <span>
                        🛒 Товар
                    </span>

                    <strong>
                        ${escapeHtml(order.product)}
                    </strong>

                </div>


                <div>

                    <span>
                        💰 Цена
                    </span>

                    <strong>
                        ${escapeHtml(order.price)}
                    </strong>

                </div>


                <div>

                    <span>
                        👤 Telegram
                    </span>

                    <strong>
                        ${escapeHtml(order.telegram)}
                    </strong>

                </div>


                <div>

                    <span>
                        🎮 Roblox
                    </span>

                    <strong>
                        ${escapeHtml(order.nickname)}
                    </strong>

                </div>

            </div>


            <div class="saved-note">
                ✅ Заказ сохранён в админ-панели
            </div>


            <a
                href="https://t.me/mm2shopsSite"
                target="_blank"
                class="success-close"
                style="
                    display:block;
                    text-align:center;
                    text-decoration:none;
                "
            >
                ✈ Написать в Telegram
            </a>

        </div>

    `;


    document.body.appendChild(
        success
    );


    success
        .querySelector(
            ".success-overlay"
        )
        .addEventListener(
            "click",
            () => success.remove()
        );

}


// ========================================
// ЗАЩИТА ТЕКСТА
// ========================================

function escapeHtml(value) {

    return String(value)
        .replace(
            /[&<>'"]/g,
            char => ({

                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#39;",
                '"': "&quot;"

            }[char])
        );

}


// ========================================
// 3D АНИМАЦИЯ КАРТОЧЕК
// ========================================

document
    .querySelectorAll(".product")
    .forEach(card => {

        card.addEventListener(
            "mousemove",
            e => {

                const rect =
                    card.getBoundingClientRect();


                const x =
                    (e.clientX - rect.left) /
                    rect.width -
                    0.5;


                const y =
                    (e.clientY - rect.top) /
                    rect.height -
                    0.5;


                card.style.transform =
                    `
                    perspective(700px)
                    rotateX(${-y * 6}deg)
                    rotateY(${x * 6}deg)
                    translateY(-8px)
                    `;

            }
        );


        card.addEventListener(
            "mouseleave",
            () => {

                card.style.transform = "";

            }
        );

    });
