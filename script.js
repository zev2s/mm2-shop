const payments = {
  bioblade: {
    product: 'BioBlade',
    price: '39 ₽',
    iframe: '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9FVEM9TP2.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'
  },
  raygun: {
    product: 'Raygun',
    price: '399 ₽',
    iframe: '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9FUT67CF8.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'
  },
  traveler: {
    product: "Traveler's Gun",
    price: '8 999 ₽',
    iframe: '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9FVP7RJJ0.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'
  },
  harvester: {
    product: 'Harvester',
    price: '299 ₽',
    iframe: '<iframe src="https://yoomoney.ru/quickpay/fundraise/button?billNumber=1K9G026LUUD.260914&" width="330" height="50" frameborder="0" allowtransparency="true" scrolling="no"></iframe>'
  }
};

const modal = document.getElementById('paymentModal');
const title = document.getElementById('paymentTitle');
const price = document.getElementById('paymentPrice');
const frame = document.getElementById('paymentFrame');
const closeButton = document.getElementById('closePayment');

function openPayment(key) {
  const payment = payments[key];
  if (!payment) return;

  title.textContent = `Оплата ${payment.product}`;
  price.textContent = payment.price;
  frame.innerHTML = payment.iframe;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closePayment() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  frame.innerHTML = '';
  document.body.style.overflow = '';
}

document.querySelectorAll('.buy').forEach(button => {
  button.addEventListener('click', () => openPayment(button.dataset.payment));
});

closeButton.addEventListener('click', closePayment);
modal.addEventListener('click', event => {
  if (event.target.dataset.close === '1') closePayment();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePayment();
});
