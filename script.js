let currentOrder = null;
let paymentTimer = null;

document.addEventListener('DOMContentLoaded', () => {

    document.querySelectorAll('.buy').forEach(button => {

        button.addEventListener('click', event => {

            event.preventDefault();

            const product =
                button.dataset.product || '';

            const price =
                button.dataset.price || '';

            const image =
                button.closest('.product')
                    ?.querySelector('img')
                    ?.getAttribute('src') || '';

            openPurchase(
                product,
                price,
                image
            );
        });

    });

    createModal();

    const params =
        new URLSearchParams(
            window.location.search
        );

    const returnedOrder =
        params.get('order');

    if(returnedOrder){

        currentOrder = {
            id: returnedOrder
        };

        showModal();

        startPaymentCheck();
    }

});


/* =========================
   MODAL
========================= */

function createModal(){

    if(document.getElementById('purchaseModal')){
        return;
    }

    const modal = document.createElement('div');

    modal.id = 'purchaseModal';

    modal.className = 'purchase-modal';

    modal.innerHTML = `

        <div class="purchase-overlay"></div>

        <div class="purchase-window">

            <button
                class="close-purchase"
                id="closePurchase"
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
                <span>Стоимость</span>
                <strong id="purchasePrice">
                    0 ₽
                </strong>
            </div>


            <!-- PAYMENT STEP -->

            <div
                id="paymentStep"
                class="payment-step"
            >

                <div class="payment-title">
                    💳 Оплата
                </div>

                <p class="payment-text">
                    Сначала оплати товар через ЮMoney.
                    После подтверждения оплаты появятся
                    поля для Telegram и Roblox ника.
                </p>

                <button
                    id="payCard"
                    class="payment-button"
                    type="button"
                >
                    💳 Оплатить картой
                </button>

                <button
                    id="payWallet"
                    class="payment-button secondary"
                    type="button"
                >
                    🟡 Оплатить через ЮMoney
                </button>

                <div
                    id="paymentStatus"
                    class="payment-status"
                >
                    Оплата ещё не начата
                </div>

            </div>


            <!-- USER DATA STEP -->

            <div
                id="dataStep"
                class="data-step"
                style="display:none"
            >

                <div class="paid-message">
                    <span>✓</span>
                    Оплата подтверждена!
                </div>

                <p class="data-description">
                    Теперь укажи данные для получения
                    предмета.
                </p>

                <form
                    id="purchaseForm"
                    class="purchase-form"
                >

                    <label>
                        Telegram
                    </label>

                    <input
                        id="telegramInput"
                        type="text"
                        placeholder="@username"
                        autocomplete="off"
                    >

                    <label>
                        Roblox ник
                    </label>

                    <input
                        id="nicknameInput"
                        type="text"
                        placeholder="Твой ник в Roblox"
                        autocomplete="off"
                    >

                    <button
                        class="submit-purchase"
                        type="submit"
                    >
                        📦 Отправить данные
                    </button>

                </form>

                <div
                    id="formError"
                    class="form-error"
                ></div>

            </div>


            <div class="purchase-note">
                После оплаты не закрывай страницу,
                пока система не подтвердит платёж.
            </div>

        </div>
    `;

    document.body.appendChild(modal);

    document
        .getElementById('closePurchase')
        .addEventListener(
            'click',
            closePurchase
        );

    document
        .querySelector('.purchase-overlay')
        .addEventListener(
            'click',
            closePurchase
        );

    document
        .getElementById('payCard')
        .addEventListener(
            'click',
            () => startPayment('AC')
        );

    document
        .getElementById('payWallet')
        .addEventListener(
            'click',
            () => startPayment('PC')
        );

    document
        .getElementById('purchaseForm')
        .addEventListener(
            'submit',
            submitUserData
        );
}


/* =========================
   OPEN PURCHASE
========================= */

function openPurchase(
    product,
    price,
    image
){

    const modal =
        document.getElementById(
            'purchaseModal'
        );

    document.getElementById(
        'purchaseProduct'
    ).textContent = product;

    document.getElementById(
        'purchasePrice'
    ).textContent = price;

    document.getElementById(
        'purchaseImage'
    ).src = image || '';

    document.getElementById(
        'paymentStep'
    ).style.display = 'block';

    document.getElementById(
        'dataStep'
    ).style.display = 'none';

    document.getElementById(
        'paymentStatus'
    ).textContent =
        'Оплата ещё не начата';

    document.getElementById(
        'formError'
    ).textContent = '';

    currentOrder = {
        product,
        price
    };

    modal.classList.add('active');

    document.body.classList.add(
        'modal-open'
    );
}


/* =========================
   CLOSE
========================= */

function closePurchase(){

    const modal =
        document.getElementById(
            'purchaseModal'
        );

    if(modal){
        modal.classList.remove('active');
    }

    document.body.classList.remove(
        'modal-open'
    );

    if(paymentTimer){
        clearInterval(paymentTimer);
        paymentTimer = null;
    }
}


/* =========================
   PAYMENT
========================= */

async function startPayment(paymentType){

    if(
        !currentOrder ||
        !currentOrder.product
    ){
        return;
    }

    const status =
        document.getElementById(
            'paymentStatus'
        );

    const card =
        document.getElementById(
            'payCard'
        );

    const wallet =
        document.getElementById(
            'payWallet'
        );

    card.disabled = true;
    wallet.disabled = true;

    status.textContent =
        'Создаём платёж...';

    try{

        const response =
            await fetch(
                '/api/payment/create',
                {
                    method:'POST',
                    headers:{
                        'Content-Type':
                            'application/json'
                    },
                    body:JSON.stringify({
                        product:
                            currentOrder.product,
                        price:
                            currentOrder.price
                    })
                }
            );

        const data =
            await response.json();

        if(!response.ok || !data.success){

            throw new Error(
                data.error ||
                'Не удалось создать платёж.'
            );
        }

        currentOrder.id =
            data.orderId;

        currentOrder.label =
            data.label;

        currentOrder.sum =
            data.sum;

        status.textContent =
            'Платёж создан. Открываем ЮMoney...';

        /*
         * ЮMoney требует POST на
         * https://yoomoney.ru/quickpay/confirm
         */

        const form =
            document.createElement('form');

        form.method = 'POST';

        form.action =
            'https://yoomoney.ru/quickpay/confirm';

        form.target =
            '_blank';

        addHidden(
            form,
            'receiver',
            data.receiver
        );

        addHidden(
            form,
            'quickpay-form',
            'button'
        );

        addHidden(
            form,
            'paymentType',
            paymentType
        );

        addHidden(
            form,
            'sum',
            data.sum
        );

        addHidden(
            form,
            'label',
            data.label
        );

        addHidden(
            form,
            'successURL',
            data.successURL
        );

        document.body.appendChild(form);

        form.submit();

        form.remove();

        status.textContent =
            '⏳ Ожидаем подтверждение оплаты...';

        startPaymentCheck();

    }catch(error){

        status.textContent =
            '❌ ' + error.message;

        card.disabled = false;
        wallet.disabled = false;
    }
}


function addHidden(
    form,
    name,
    value
){

    const input =
        document.createElement('input');

    input.type = 'hidden';

    input.name = name;

    input.value = value;

    form.appendChild(input);
}


/* =========================
   CHECK PAYMENT
========================= */

function startPaymentCheck(){

    if(paymentTimer){
        clearInterval(paymentTimer);
    }

    checkPayment();

    paymentTimer =
        setInterval(
            checkPayment,
            3000
        );
}


async function checkPayment(){

    if(
        !currentOrder ||
        !currentOrder.id
    ){
        return;
    }

    try{

        const response =
            await fetch(
                '/api/payment/status?order=' +
                encodeURIComponent(
                    currentOrder.id
                ),
                {
                    cache:'no-store'
                }
            );

        const data =
            await response.json();

        if(
            !response.ok ||
            !data.success
        ){
            return;
        }

        if(
            data.status === 'paid' ||
            data.status === 'completed'
        ){

            if(paymentTimer){
                clearInterval(paymentTimer);
                paymentTimer = null;
            }

            showDataStep();

        }else{

            const status =
                document.getElementById(
                    'paymentStatus'
                );

            if(status){

                status.textContent =
                    '⏳ Ожидаем подтверждение оплаты...';
            }
        }

    }catch(error){

        console.log(
            'Payment check error:',
            error
        );
    }
}


/* =========================
   SHOW DATA
========================= */

function showDataStep(){

    document.getElementById(
        'paymentStep'
    ).style.display = 'none';

    document.getElementById(
        'dataStep'
    ).style.display = 'block';

    const telegram =
        document.getElementById(
            'telegramInput'
        );

    if(telegram){
        telegram.focus();
    }
}


/* =========================
   SUBMIT DATA
========================= */

async function submitUserData(event){

    event.preventDefault();

    const telegram =
        document.getElementById(
            'telegramInput'
        ).value.trim();

    const nickname =
        document.getElementById(
            'nicknameInput'
        ).value.trim();

    const errorBox =
        document.getElementById(
            'formError'
        );

    errorBox.textContent = '';

    if(!telegram){

        errorBox.textContent =
            'Укажи Telegram.';

        return;
    }

    if(!nickname){

        errorBox.textContent =
            'Укажи Roblox ник.';

        return;
    }

    const button =
        document.querySelector(
            '.submit-purchase'
        );

    button.disabled = true;

    button.textContent =
        'Отправляем...';

    try{

        const response =
            await fetch(
                '/api/orders',
                {
                    method:'POST',
                    headers:{
                        'Content-Type':
                            'application/json'
                    },
                    body:JSON.stringify({
                        orderId:
                            currentOrder.id,
                        telegram,
                        nickname
                    })
                }
            );

        const data =
            await response.json();

        if(
            !response.ok ||
            !data.success
        ){

            throw new Error(
                data.error ||
                'Не удалось отправить данные.'
            );
        }

        showSuccess(
            data.order
        );

    }catch(error){

        errorBox.textContent =
            '❌ ' + error.message;

        button.disabled = false;

        button.textContent =
            '📦 Отправить данные';
    }
}


/* =========================
   SUCCESS
========================= */

function showSuccess(order){

    const modal =
        document.getElementById(
            'purchaseModal'
        );

    const window =
        modal.querySelector(
            '.purchase-window'
        );

    window.innerHTML = `

        <div class="success-content">

            <div class="success-icon">
                ✓
            </div>

            <div class="success-label">
                MM2 SHOP
            </div>

            <h2>
                Заказ оформлен!
            </h2>

            <p class="success-main">
                Оплата подтверждена.
                Данные получены.
            </p>

            <div class="success-details">

                <div>
                    <span>Товар</span>
                    <strong>
                        ${escapeHtml(order.product)}
                    </strong>
                </div>

                <div>
                    <span>Цена</span>
                    <strong>
                        ${escapeHtml(order.price)}
                    </strong>
                </div>

                <div>
                    <span>Telegram</span>
                    <strong>
                        ${escapeHtml(order.telegram)}
                    </strong>
                </div>

                <div>
                    <span>Roblox</span>
                    <strong>
                        ${escapeHtml(order.nickname)}
                    </strong>
                </div>

            </div>

            <p class="saved-note">
                Заказ передан владельцу магазина.
            </p>

            <button
                class="success-close"
                onclick="closePurchase()"
            >
                Готово
            </button>

        </div>
    `;
}


/* =========================
   ESCAPE HTML
========================= */

function escapeHtml(value){

    return String(value ?? '')
        .replace(/[&<>'"]/g, function(char){

            return {
                '&':'&amp;',
                '<':'&lt;',
                '>':'&gt;',
                "'":'&#39;',
                '"':'&quot;'
            }[char];

        });
}
