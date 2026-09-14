// ======================================================
// MM2 SHOP
// ЮMoney → подтверждение оплаты → данные пользователя
// ======================================================


// ======================================================
// ПЛАВНАЯ ПРОКРУТКА
// ======================================================

document
    .querySelectorAll('a[href^="#"]')
    .forEach(link => {

        link.addEventListener(
            "click",
            event => {

                const target =
                    document.querySelector(
                        link.getAttribute("href")
                    );


                if (!target) return;


                event.preventDefault();


                target.scrollIntoView({
                    behavior:"smooth",
                    block:"start"
                });

            }
        );

    });


// ======================================================
// АНИМАЦИИ
// ======================================================

const animatedElements =
    document.querySelectorAll(
        ".product, .feature, .contact-box, .section-title"
    );


if (
    "IntersectionObserver" in window
) {

    const observer =
        new IntersectionObserver(
            entries => {

                entries.forEach(
                    entry => {

                        if (
                            entry.isIntersecting
                        ) {

                            entry.target
                                .classList
                                .add("show");

                        }

                    }
                );

            },
            {
                threshold:0.12
            }
        );


    animatedElements.forEach(
        element =>
            observer.observe(
                element
            )
    );

}


// ======================================================
// ТЕКУЩИЙ ЗАКАЗ
// ======================================================

let currentOrder = null;


// ======================================================
// MODAL
// ======================================================

const modal =
    document.createElement(
        "div"
    );


modal.className =
    "purchase-modal";


modal.innerHTML = `

<div class="purchase-overlay"></div>

<div class="purchase-window">

    <button
        class="close-purchase"
        type="button"
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


    <!-- ШАГ 1 -->

    <div
        id="paymentStep"
        class="payment-step"
    >

        <div class="step-number">
            1
        </div>

        <div class="step-title">
            Оплати заказ
        </div>

        <p class="step-description">
            Перейди на страницу ЮMoney и
            оплати указанную сумму.
        </p>


        <button
            id="payButton"
            class="pay-button"
            type="button"
        >
            💳 Перейти к оплате
        </button>


        <div
            id="paymentWaiting"
            class="payment-waiting"
        >

            <div class="spinner"></div>

            <strong>
                Ожидаем оплату...
            </strong>

            <span>
                После оплаты страница
                автоматически продолжит оформление.
            </span>

        </div>

    </div>


    <!-- ШАГ 2 -->

    <div
        id="dataStep"
        class="data-step"
    >

        <div class="step-number">
            2
        </div>

        <div class="step-title">
            Укажи данные
        </div>

        <p class="step-description">
            Оплата подтверждена.
            Теперь укажи Telegram и ник Roblox.
        </p>


        <div class="purchase-form">

            <label>
                👤 Юз в Telegram
            </label>

            <input
                id="telegramUsername"
                type="text"
                placeholder="@username"
                maxlength="50"
                autocomplete="off"
            >


            <label>
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


        <button
            id="submitPurchase"
            class="submit-purchase"
            type="button"
        >
            ✅ Отправить данные
        </button>


        <div
            id="orderError"
            class="order-error"
        ></div>

    </div>


    <div class="purchase-note">
        🔒 Данные нужны только для связи и выдачи предмета.
    </div>

</div>

`;


document.body.appendChild(
    modal
);


// ======================================================
// ELEMENTS
// ======================================================

const purchaseImage =
    document.getElementById(
        "purchaseImage"
    );

const purchaseProduct =
    document.getElementById(
        "purchaseProduct"
    );

const purchasePrice =
    document.getElementById(
        "purchasePrice"
    );

const payButton =
    document.getElementById(
        "payButton"
    );

const paymentWaiting =
    document.getElementById(
        "paymentWaiting"
    );

const dataStep =
    document.getElementById(
        "dataStep"
    );

const telegramUsername =
    document.getElementById(
        "telegramUsername"
    );

const gameNickname =
    document.getElementById(
        "gameNickname"
    );

const submitPurchase =
    document.getElementById(
        "submitPurchase"
    );

const orderError =
    document.getElementById(
        "orderError"
    );


// ======================================================
// CLOSE
// ======================================================

function closePurchaseModal() {

    modal.classList.remove(
        "active"
    );

    document.body.classList.remove(
        "modal-open"
    );

}


document
    .querySelector(
        ".close-purchase"
    )
    .addEventListener(
        "click",
        closePurchaseModal
    );


document
    .querySelector(
        ".purchase-overlay"
    )
    .addEventListener(
        "click",
        closePurchaseModal
    );


document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {

            closePurchaseModal();

        }

    }
);


// ======================================================
// OPEN PURCHASE
// ======================================================

document.addEventListener(
    "click",
    async event => {

        const button =
            event.target.closest(
                ".buy"
            );


        if (!button) return;


        event.preventDefault();


        const card =
            button.closest(
                ".product"
            );


        const image =
            card
                ? card.querySelector(
                    ".product-image img"
                )
                : null;


        const product =
            button.dataset.product;


        const price =
            button.dataset.price;


        if (
            !product ||
            !price
        ) {

            return;

        }


        currentOrder = {

            product,

            price,

            image:
                image
                    ? image.src
                    : "",

            id:null

        };


        purchaseProduct.textContent =
            product;


        purchasePrice.textContent =
            price;


        purchaseImage.src =
            currentOrder.image;


        // Сбрасываем состояние

        paymentWaiting
            .classList
            .remove(
                "active"
            );


        dataStep
            .classList
            .remove(
                "active"
            );


        payButton
            .classList
            .remove(
                "hidden"
            );


        orderError.textContent =
            "";


        telegramUsername.value =
            "";

        gameNickname.value =
            "";


        modal.classList.add(
            "active"
        );


        document.body.classList.add(
            "modal-open"
        );


        payButton.disabled =
            true;


        payButton.textContent =
            "⏳ Создаём оплату...";


        try {

            const response =
                await fetch(
                    "/api/payment/create",
                    {

                        method:"POST",

                        headers:{
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                product,

                                price

                            })

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
                    "Не удалось создать оплату."
                );

            }


            currentOrder.id =
                data.orderId;


            currentOrder.paymentUrl =
                data.paymentUrl;


            payButton.disabled =
                false;


            payButton.textContent =
                "💳 Перейти к оплате";


        } catch (error) {

            orderError.textContent =
                "❌ " +
                error.message;


            orderError.style.display =
                "block";


            payButton.textContent =
                "Попробовать снова";


            payButton.disabled =
                false;

        }

    }
);


// ======================================================
// OPEN YOOMONEY
// ======================================================

payButton.addEventListener(
    "click",
    () => {

        if (
            !currentOrder ||
            !currentOrder.paymentUrl
        ) {

            return;

        }


        // Открываем ЮMoney
        // в новой вкладке

        window.open(
            currentOrder.paymentUrl,
            "_blank"
        );


        payButton.classList.add(
            "hidden"
        );


        paymentWaiting.classList.add(
            "active"
        );


        startPaymentPolling();

    }
);


// ======================================================
// POLL PAYMENT
// ======================================================

let paymentPollingTimer =
    null;


function startPaymentPolling() {

    if (
        paymentPollingTimer
    ) {

        clearInterval(
            paymentPollingTimer
        );

    }


    let attempts = 0;


    paymentPollingTimer =
        setInterval(
            async () => {

                attempts++;


                if (
                    attempts > 180
                ) {

                    clearInterval(
                        paymentPollingTimer
                    );

                    paymentWaiting
                        .classList
                        .remove(
                            "active"
                        );


                    payButton
                        .classList
                        .remove(
                            "hidden"
                        );


                    payButton.textContent =
                        "💳 Проверить оплату";


                    return;

                }


                if (
                    !currentOrder ||
                    !currentOrder.id
                ) {

                    return;

                }


                try {

                    const response =
                        await fetch(
                            "/api/payment/status?id=" +
                            encodeURIComponent(
                                currentOrder.id
                            ),
                            {
                                cache:
                                    "no-store"
                            }
                        );


                    const data =
                        await response.json();


                    if (
                        data.status ===
                        "paid_waiting_data"
                        ||
                        data.status ===
                        "completed"
                    ) {

                        clearInterval(
                            paymentPollingTimer
                        );


                        paymentWaiting
                            .classList
                            .remove(
                                "active"
                            );


                        showDataStep();

                    }

                } catch {

                    // Продолжаем проверять

                }

            },
            3000
        );

}


// ======================================================
// DATA STEP
// ======================================================

function showDataStep() {

    dataStep.classList.add(
        "active"
    );


    setTimeout(
        () => {

            telegramUsername.focus();

        },
        200
    );

}


// ======================================================
// ERROR
// ======================================================

function showError(
    message,
    input
) {

    orderError.textContent =
        "❌ " + message;


    orderError.style.display =
        "block";


    if (input) {

        input.focus();

        input.classList.add(
            "input-error"
        );


        setTimeout(
            () => {

                input.classList.remove(
                    "input-error"
                );

            },
            600
        );

    }

}


// ======================================================
// SAVE DATA
// ======================================================

submitPurchase.addEventListener(
    "click",
    async () => {

        if (
            !currentOrder ||
            !currentOrder.id ||
            submitPurchase.disabled
        ) {

            return;

        }


        let telegram =
            telegramUsername.value
                .trim();


        const nickname =
            gameNickname.value
                .trim();


        if (!telegram) {

            showError(
                "Укажи юз в Telegram.",
                telegramUsername
            );

            return;

        }


        if (
            !telegram.startsWith("@")
        ) {

            telegram =
                "@" + telegram;

        }


        if (!nickname) {

            showError(
                "Укажи ник в Roblox.",
                gameNickname
            );

            return;

        }


        submitPurchase.disabled =
            true;


        submitPurchase.textContent =
            "⏳ Сохраняем...";


        orderError.style.display =
            "none";


        try {

            const response =
                await fetch(
                    "/api/orders",
                    {

                        method:"POST",

                        headers:{
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                orderId:
                                    currentOrder.id,

                                telegram,

                                nickname

                            })

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
                    "Не удалось сохранить данные."
                );

            }


            clearInterval(
                paymentPollingTimer
            );


            closePurchaseModal();


            showSuccess(
                data.order
            );


        } catch (error) {

            showError(
                error.message
            );


        } finally {

            submitPurchase.disabled =
                false;


            submitPurchase.textContent =
                "✅ Отправить данные";

        }

    }
);


// ======================================================
// SUCCESS
// ======================================================

function showSuccess(
    order
) {

    const success =
        document.createElement(
            "div"
        );


    success.className =
        "success-modal active";


    success.innerHTML = `

<div class="success-overlay"></div>

<div class="success-window">

    <div class="success-icon">
        ✓
    </div>


    <div class="success-label">
        ОПЛАТА ПОДТВЕРЖДЕНА
    </div>


    <h2>
        Заказ оформлен! 🎉
    </h2>


    <p class="success-main">
        Данные сохранены.
        Скоро с тобой свяжутся.
    </p>


    <div class="success-details">

        <div>

            <span>
                🛒 Товар
            </span>

            <strong>
                ${escapeHtml(
                    order.product
                )}
            </strong>

        </div>


        <div>

            <span>
                💰 Цена
            </span>

            <strong>
                ${escapeHtml(
                    order.price
                )}
            </strong>

        </div>


        <div>

            <span>
                👤 Telegram
            </span>

            <strong>
                ${escapeHtml(
                    order.telegram
                )}
            </strong>

        </div>


        <div>

            <span>
                🎮 Roblox
            </span>

            <strong>
                ${escapeHtml(
                    order.nickname
                )}
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
            () => {

                success.remove();

            }
        );

}


// ======================================================
// ESCAPE HTML
// ======================================================

function escapeHtml(
    value
) {

    return String(value)
        .replace(
            /[&<>'"]/g,
            char => ({

                "&":"&amp;",
                "<":"&lt;",
                ">":"&gt;",
                "'":"&#39;",
                '"':"&quot;"

            }[char])
        );

}


// ======================================================
// 3D КАРТОЧКИ
// ======================================================

document
    .querySelectorAll(
        ".product"
    )
    .forEach(card => {

        card.addEventListener(
            "mousemove",
            event => {

                const rect =
                    card.getBoundingClientRect();


                const x =
                    (
                        event.clientX -
                        rect.left
                    ) /
                    rect.width -
                    0.5;


                const y =
                    (
                        event.clientY -
                        rect.top
                    ) /
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

                card.style.transform =
                    "";

            }
        );

    });


// ======================================================
// ПРЕДОТВРАЩАЕМ СЛУЧАЙНЫЙ ВЫХОД
// ======================================================

window.addEventListener(
    "beforeunload",
    () => {

        if (
            paymentPollingTimer
        ) {

            clearInterval(
                paymentPollingTimer
            );

        }

    }
);
