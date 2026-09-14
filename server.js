(() => {
  'use strict';


  /* =========================
     PRODUCTS
  ========================== */

  const products = {

    'BioBlade': {
      image: 'green_knife.png',
      rarity: 'GODLY • KNIFE'
    },

    'Raygun': {
      image: 'green_gun.png',
      rarity: 'GODLY • GUN'
    },

    "Traveler's Gun": {
      image: 'pumpkin_gun.png',
      rarity: 'LIMITED • GUN'
    },

    'Harvester': {
      image: 'green_bow.png',
      rarity: 'GODLY • BOW'
    },

    'Тест': {
      image: 'green_knife.png',
      rarity: 'TEST • 2 ₽'
    }

  };


  /* =========================
     TELEGRAM
  ========================== */

  const TELEGRAM_CHANNEL =
    'https://t.me/mm2site';


  /* =========================
     STATE
  ========================== */

  let currentOrder = null;

  let pollTimer = null;

  let pollStartedAt = 0;



  /* =========================
     ESCAPE HTML
  ========================== */

  const esc = (value) =>
    String(value ?? '')
      .replace(
        /[&<>'"]/g,
        ch => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[ch])
      );



  /* =========================
     CREATE PAYMENT MODAL
  ========================== */

  function ensureModal() {

    if (
      document.getElementById(
        'purchaseModal'
      )
    ) {
      return;
    }


    const modal =
      document.createElement('div');


    modal.id =
      'purchaseModal';


    modal.className =
      'purchase-modal';


    modal.innerHTML = `

      <div
        class="purchase-overlay"
        data-close="1"
      ></div>


      <div
        class="purchase-window"
        role="dialog"
        aria-modal="true"
      >

        <button
          class="close-purchase"
          type="button"
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


        <div
          class="purchase-rarity"
          id="purchaseRarity"
        >
          MM2 ITEM
        </div>


        <h2 id="purchaseTitle">
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



        <!-- PAYMENT -->

        <div
          id="paymentStep"
          class="payment-step"
        >

          <div
            class="payment-status waiting"
            id="paymentStatus"
          >

            <span class="payment-dot"></span>

            <div>

              <b>
                Ожидаем оплату
              </b>

              <small id="paymentHint">
                Сначала оплати товар через ЮMoney.
              </small>

            </div>

          </div>


          <button
            class="submit-purchase payment-button"
            id="payButton"
            type="button"
          >
            💳 Оплатить через ЮMoney
          </button>


          <p
            class="purchase-note"
            id="normalPaymentNote"
          >
            После оплаты сайт автоматически получит
            подтверждение от ЮMoney.
            Нажимать «Я оплатил» не нужно.
          </p>

        </div>



        <!-- USER DATA -->

        <form
          id="userDataStep"
          class="purchase-form"
          style="display:none"
        >

          <div
            class="payment-status paid"
            id="paidStatus"
          >

            <span class="payment-dot"></span>

            <div>

              <b>
                Оплата подтверждена ✓
              </b>

              <small>
                Теперь укажи данные для получения заказа.
              </small>

            </div>

          </div>


          <label for="telegramInput">
            Telegram
          </label>


          <input
            id="telegramInput"
            name="telegram"
            type="text"
            maxlength="80"
            placeholder="@username"
            autocomplete="off"
            required
          >


          <label for="nicknameInput">
            Roblox ник
          </label>


          <input
            id="nicknameInput"
            name="nickname"
            type="text"
            maxlength="80"
            placeholder="Твой Roblox ник"
            autocomplete="off"
            required
          >


          <button
            class="submit-purchase"
            type="submit"
          >
            ✅ Оформить заказ
          </button>


          <p class="purchase-note">
            Заказ отправится владельцу только
            после подтверждённой оплаты.
          </p>

        </form>

      </div>
    `;


    document.body.appendChild(modal);


    /* CLOSE */

    modal
      .querySelector(
        '.close-purchase'
      )
      .addEventListener(
        'click',
        closeModal
      );


    modal
      .querySelector(
        '.purchase-overlay'
      )
      .addEventListener(
        'click',
        closeModal
      );


    /* PAYMENT */

    modal
      .querySelector(
        '#payButton'
      )
      .addEventListener(
        'click',
        beginPayment
      );


    /* FORM */

    modal
      .querySelector(
        '#userDataStep'
      )
      .addEventListener(
        'submit',
        submitUserData
      );

  }



  /* =========================
     OPEN MODAL
  ========================== */

  function openModal(
    product,
    price
  ) {

    ensureModal();

    stopPolling();

    currentOrder = null;


    const data =
      products[product] || {};


    const modal =
      document.getElementById(
        'purchaseModal'
      );


    document.getElementById(
      'purchaseImage'
    ).src =
      data.image || '';


    document.getElementById(
      'purchaseRarity'
    ).textContent =
      data.rarity ||
      'MM2 ITEM';


    document.getElementById(
      'purchaseTitle'
    ).textContent =
      product;


    document.getElementById(
      'purchasePrice'
    ).textContent =
      price;


    /* RESET PAYMENT */

    document.getElementById(
      'paymentStep'
    ).style.display = '';


    document.getElementById(
      'payButton'
    ).style.display = '';


    document.getElementById(
      'normalPaymentNote'
    ).style.display = '';


    document.getElementById(
      'userDataStep'
    ).style.display = 'none';


    document.getElementById(
      'payButton'
    ).disabled = false;


    document.getElementById(
      'payButton'
    ).textContent =
      '💳 Оплатить через ЮMoney';


    setPaymentStatus(
      'waiting',
      'Ожидаем оплату',
      'Сначала оплати товар через ЮMoney.'
    );


    document.getElementById(
      'telegramInput'
    ).value = '';


    document.getElementById(
      'nicknameInput'
    ).value = '';


    modal.classList.add(
      'active'
    );


    document.body.classList.add(
      'modal-open'
    );

  }



  /* =========================
     CLOSE MODAL
  ========================== */

  function closeModal() {

    stopPolling();


    const modal =
      document.getElementById(
        'purchaseModal'
      );


    if (modal) {
      modal.classList.remove(
        'active'
      );
    }


    document.body.classList.remove(
      'modal-open'
    );

  }



  /* =========================
     PAYMENT STATUS
  ========================== */

  function setPaymentStatus(
    type,
    title,
    text
  ) {

    const box =
      document.getElementById(
        'paymentStatus'
      );


    if (!box) {
      return;
    }


    box.className =
      `payment-status ${type}`;


    box.innerHTML = `

      <span class="payment-dot"></span>

      <div>

        <b>
          ${esc(title)}
        </b>

        <small>
          ${esc(text)}
        </small>

      </div>

    `;

  }



  /* =========================
     BEGIN PAYMENT
  ========================== */

  async function beginPayment() {

    const button =
      document.getElementById(
        'payButton'
      );


    if (
      currentOrder?.orderId
    ) {

      openPayment();

      return;
    }


    const product =
      document
        .getElementById(
          'purchaseTitle'
        )
        .textContent
        .trim();


    const price =
      document
        .getElementById(
          'purchasePrice'
        )
        .textContent
        .trim();


    button.disabled = true;

    button.textContent =
      '⏳ Создаём платёж...';


    try {

      const response =
        await fetch(
          '/api/payment/create',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
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
          'Не удалось создать платёж.'
        );

      }


      currentOrder =
        data;


      setPaymentStatus(
        'waiting',
        'Платёж открыт',
        `Сумма: ${data.sum} ₽. Оплати в окне ЮMoney.`
      );


      startPolling(
        data.orderId
      );


      openPayment();

    } catch (error) {

      console.error(error);


      setPaymentStatus(
        'error',
        'Ошибка',
        error.message ||
        'Не удалось создать платёж.'
      );


      button.disabled = false;


      button.textContent =
        '💳 Попробовать снова';

    }

  }



  /* =========================
     OPEN YOOMONEY
  ========================== */

  function openPayment() {

    if (
      !currentOrder ||
      !currentOrder.orderId
    ) {
      return;
    }


    const form =
      document.createElement(
        'form'
      );


    form.method =
      'POST';


    form.action =
      'https://yoomoney.ru/quickpay/confirm';


    form.target =
      '_blank';


    form.style.display =
      'none';


    const values = {

      receiver:
        currentOrder.receiver,

      'quickpay-form':
        'button',

      paymentType:
        'AC',

      targets:
        `MM2 SHOP — ${currentOrder.orderId}`,

      sum:
        currentOrder.sum,

      label:
        currentOrder.label,

      successURL:
        `${location.origin}/?payment=success&order=${encodeURIComponent(
          currentOrder.orderId
        )}`

    };


    Object.entries(
      values
    ).forEach(
      ([name, value]) => {

        const input =
          document.createElement(
            'input'
          );


        input.type =
          'hidden';


        input.name =
          name;


        input.value =
          value ?? '';


        form.appendChild(
          input
        );

      }
    );


    document.body.appendChild(
      form
    );


    form.submit();


    form.remove();


    setPaymentStatus(
      'waiting',
      'Платёж открыт',
      'Оплати в окне ЮMoney. Мы проверяем оплату автоматически.'
    );

  }



  /* =========================
     START POLLING
  ========================== */

  function startPolling(
    orderId
  ) {

    stopPolling();


    pollStartedAt =
      Date.now();


    checkPayment(
      orderId
    );


    pollTimer =
      setInterval(
        () =>
          checkPayment(
            orderId
          ),
        3000
      );

  }



  /* =========================
     STOP POLLING
  ========================== */

  function stopPolling() {

    if (pollTimer) {

      clearInterval(
        pollTimer
      );

    }


    pollTimer = null;

  }



  /* =========================
     CHECK PAYMENT
  ========================== */

  async function checkPayment(
    orderId
  ) {

    if (!orderId) {
      return;
    }


    if (
      Date.now() -
      pollStartedAt >
      15 * 60 * 1000
    ) {

      stopPolling();


      setPaymentStatus(
        'error',
        'Проверка остановлена',
        'Если ты уже оплатил, обнови страницу и открой заказ снова.'
      );


      return;

    }


    try {

      const response =
        await fetch(
          '/api/payment/status?order=' +
          encodeURIComponent(
            orderId
          ),
          {
            cache:
              'no-store'
          }
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.success
      ) {
        return;
      }


      if (
        data.status ===
        'paid'
      ) {

        stopPolling();


        showDataStep(
          data.order
        );

      }

    } catch (error) {

      console.warn(
        'Payment status:',
        error
      );

    }

  }



  /* =========================
     SHOW USER DATA STEP
  ========================== */

  function showDataStep(
    order
  ) {

    currentOrder = {
      ...currentOrder,

      orderId:
        order.id
    };


    document.getElementById(
      'paymentStep'
    ).style.display =
      'none';


    document.getElementById(
      'userDataStep'
    ).style.display =
      'flex';


    document.getElementById(
      'telegramInput'
    ).focus();

  }



  /* =========================
     SUBMIT USER DATA
  ========================== */

  async function submitUserData(
    event
  ) {

    event.preventDefault();


    const telegramInput =
      document.getElementById(
        'telegramInput'
      );


    const nicknameInput =
      document.getElementById(
        'nicknameInput'
      );


    const telegram =
      telegramInput.value.trim();


    const nickname =
      nicknameInput.value.trim();


    telegramInput.classList.remove(
      'input-error'
    );


    nicknameInput.classList.remove(
      'input-error'
    );


    if (!telegram) {

      telegramInput.classList.add(
        'input-error'
      );

    }


    if (!nickname) {

      nicknameInput.classList.add(
        'input-error'
      );

    }


    if (
      !telegram ||
      !nickname
    ) {
      return;
    }


    const button =
      event.currentTarget
        .querySelector(
          'button[type="submit"]'
        );


    button.disabled = true;


    button.textContent =
      '⏳ Сохраняем заказ...';


    try {

      const response =
        await fetch(
          '/api/orders',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify({
                orderId:
                  currentOrder.orderId,

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
          'Не удалось сохранить заказ.'
        );

      }


      showSuccess(
        data.order
      );

    } catch (error) {

      alert(
        error.message ||
        'Ошибка оформления заказа.'
      );


      button.disabled = false;


      button.textContent =
        '✅ Оформить заказ';

    }

  }



  /* =========================
     SUCCESS SCREEN
  ========================== */

  function showSuccess(
    order
  ) {

    const modal =
      document.getElementById(
        'purchaseModal'
      );


    modal.innerHTML = `

      <div class="success-overlay"></div>


      <div class="success-window">


        <div class="success-icon">
          ✓
        </div>


        <div class="success-label">
          MM2 SHOP
        </div>


        <h2>
          Заказ принят!
        </h2>


        <p class="success-main">
          Оплата подтверждена,
          данные получены.
        </p>


        <div class="success-details">


          <div>
            <span>
              Товар
            </span>

            <strong>
              ${esc(order.product)}
            </strong>
          </div>


          <div>
            <span>
              Цена
            </span>

            <strong>
              ${esc(order.price)}
            </strong>
          </div>


          <div>
            <span>
              Telegram
            </span>

            <strong>
              ${esc(order.telegram)}
            </strong>
          </div>


          <div>
            <span>
              Roblox
            </span>

            <strong>
              ${esc(order.nickname)}
            </strong>
          </div>


          <div>
            <span>
              Номер заказа
            </span>

            <strong>
              ${esc(order.id)}
            </strong>
          </div>


        </div>


        <p class="saved-note">
          Владелец магазина получил заказ
          и свяжется с тобой.
        </p>


        <!-- TELEGRAM AFTER PAYMENT -->

        <div class="success-telegram-note">

          <strong>
            ⭐ Отзывы можете посмотреть в ТГК
          </strong>

          Здесь публикуются свежие новости,
          обновления магазина и отзывы покупателей.

          <br>

          <a
            href="${TELEGRAM_CHANNEL}"
            target="_blank"
            rel="noopener noreferrer"
            class="success-telegram-link"
          >
            ✈ @mm2site →
          </a>

        </div>


        <button
          class="success-close"
          type="button"
        >
          Закрыть
        </button>


      </div>

    `;


    modal.classList.add(
      'active'
    );


    modal
      .querySelector(
        '.success-close'
      )
      .addEventListener(
        'click',
        closeModal
      );

  }



  /* =========================
     PAYMENT SUCCESS URL
  ========================== */

  function handleSuccessUrl() {

    const params =
      new URLSearchParams(
        location.search
      );


    const orderId =
      params.get(
        'order'
      );


    if (
      params.get(
        'payment'
      ) !== 'success' ||
      !orderId
    ) {
      return;
    }


    ensureModal();


    const modal =
      document.getElementById(
        'purchaseModal'
      );


    modal.classList.add(
      'active'
    );


    document.body.classList.add(
      'modal-open'
    );


    setPaymentStatus(
      'waiting',
      'Проверяем оплату',
      'Подожди несколько секунд, пока ЮMoney отправит подтверждение.'
    );


    startPolling(
      orderId
    );

  }



  /* =========================
     BUY BUTTONS
  ========================== */

  document.addEventListener(
    'click',
    (event) => {

      const buy =
        event.target.closest(
          '.buy'
        );


      if (!buy) {
        return;
      }


      event.preventDefault();


      openModal(
        buy.dataset.product,
        buy.dataset.price
      );

    }
  );



  /* =========================
     ESCAPE
  ========================== */

  document.addEventListener(
    'keydown',
    (event) => {

      if (
        event.key ===
        'Escape'
      ) {

        closeModal();

      }

    }
  );



  /* =========================
     PAGE LOAD
  ========================== */

  document.addEventListener(
    'DOMContentLoaded',
    () => {

      handleSuccessUrl();


      const observer =
        new IntersectionObserver(
          entries => {

            entries.forEach(
              entry => {

                if (
                  entry.isIntersecting
                ) {

                  entry.target.classList.add(
                    'show'
                  );

                }

              }
            );

          },
          {
            threshold:.08
          }
        );


      document
        .querySelectorAll(
          `
          .product,
          .feature,
          .section-title,
          .contact-box,
          .telegram-box
          `
        )
        .forEach(
          el =>
            observer.observe(
              el
            )
        );

    }
  );

})();
