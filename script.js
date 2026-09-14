// MM2 SHOP — secure server orders

document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", e => {
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
});

const animated = document.querySelectorAll(".product,.feature,.contact-box,.section-title");
if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add("show");
        });
    }, { threshold: .12 });
    animated.forEach(el => observer.observe(el));
}

let currentOrder = null;

const modal = document.createElement("div");
modal.className = "purchase-modal";
modal.innerHTML = `
    <div class="purchase-overlay"></div>
    <div class="purchase-window">
        <button class="close-purchase" aria-label="Закрыть">×</button>
        <div class="purchase-image-box"><img id="purchaseImage" src="" alt="Выбранный предмет"></div>
        <div class="purchase-rarity">MM2 ITEM</div>
        <h2 id="purchaseProduct">Товар</h2>
        <div class="purchase-price"><span>Цена</span><strong id="purchasePrice">0 ₽</strong></div>
        <div class="purchase-form">
            <label for="telegramUsername">👤 Юз в Telegram</label>
            <input id="telegramUsername" type="text" placeholder="@username" maxlength="50" autocomplete="off">
            <label for="gameNickname">🎮 Ник в игре</label>
            <input id="gameNickname" type="text" placeholder="Ник в Roblox" maxlength="50" autocomplete="off">
            <button class="submit-purchase" id="submitPurchase">✈ Оформить заказ</button>
            <div id="orderError" style="display:none;margin-top:10px;color:#ff7070;font-size:14px;"></div>
        </div>
        <p class="purchase-note">После оформления заказ сразу отправляется владельцу магазина.</p>
    </div>
`;
document.body.appendChild(modal);

const purchaseImage = document.getElementById("purchaseImage");
const purchaseProduct = document.getElementById("purchaseProduct");
const purchasePrice = document.getElementById("purchasePrice");
const telegramUsername = document.getElementById("telegramUsername");
const gameNickname = document.getElementById("gameNickname");
const submitPurchase = document.getElementById("submitPurchase");
const orderError = document.getElementById("orderError");

function closePurchaseModal() {
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
}
document.querySelector(".close-purchase").addEventListener("click", closePurchaseModal);
document.querySelector(".purchase-overlay").addEventListener("click", closePurchaseModal);
document.addEventListener("keydown", e => { if (e.key === "Escape") closePurchaseModal(); });

document.addEventListener("click", e => {
    const buy = e.target.closest(".buy, .buy-button");
    if (!buy) return;
    e.preventDefault();

    const card = buy.closest(".product");
    const image = card ? card.querySelector(".product-image img") : null;
    currentOrder = {
        product: buy.dataset.product || "MM2 предмет",
        price: buy.dataset.price || "Цена уточняется",
        image: image ? image.getAttribute("src") : ""
    };

    purchaseProduct.textContent = currentOrder.product;
    purchasePrice.textContent = currentOrder.price;
    purchaseImage.src = currentOrder.image;
    telegramUsername.value = "";
    gameNickname.value = "";
    orderError.style.display = "none";
    orderError.textContent = "";

    modal.classList.add("active");
    document.body.classList.add("modal-open");
    setTimeout(() => telegramUsername.focus(), 200);
});

function markError(input, message) {
    input.classList.add("input-error");
    input.focus();
    if (message) {
        orderError.textContent = message;
        orderError.style.display = "block";
    }
    setTimeout(() => input.classList.remove("input-error"), 600);
}

submitPurchase.addEventListener("click", async () => {
    if (!currentOrder || submitPurchase.disabled) return;

    let tg = telegramUsername.value.trim();
    const nick = gameNickname.value.trim();

    if (!tg) return markError(telegramUsername, "Укажи Telegram.");
    if (!nick) return markError(gameNickname, "Укажи ник в Roblox.");
    if (!tg.startsWith("@")) tg = "@" + tg;

    submitPurchase.disabled = true;
    submitPurchase.textContent = "⏳ Отправляем...";
    orderError.style.display = "none";

    const order = {
        product: currentOrder.product,
        price: currentOrder.price,
        telegram: tg,
        nickname: nick
    };

    try {
        const response = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(order)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Не удалось отправить заказ.");
        }

        closePurchaseModal();
        showOrderSuccess({
            ...order,
            id: data.order.id,
            date: data.order.date
        });
    } catch (err) {
        orderError.textContent = "❌ " + err.message + " Если сайт открыт не через сервер, запусти server.js.";
        orderError.style.display = "block";
    } finally {
        submitPurchase.disabled = false;
        submitPurchase.textContent = "✈ Оформить заказ";
    }
});

[telegramUsername, gameNickname].forEach(input => {
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") submitPurchase.click();
    });
});

function showOrderSuccess(order) {
    const success = document.createElement("div");
    success.className = "success-modal active";
    success.innerHTML = `
        <div class="success-overlay"></div>
        <div class="success-window">
            <div class="success-icon">✓</div>
            <div class="success-label">ЗАКАЗ ПРИНЯТ</div>
            <h2>Спасибо за заказ! 🎉</h2>
            <p class="success-main">Вам ответят в ближайшее время.</p>
            <div class="success-details">
                <div><span>🛒 Товар</span><strong>${escapeHtml(order.product)}</strong></div>
                <div><span>💰 Цена</span><strong>${escapeHtml(order.price)}</strong></div>
                <div><span>👤 Telegram</span><strong>${escapeHtml(order.telegram)}</strong></div>
                <div><span>🎮 Ник в игре</span><strong>${escapeHtml(order.nickname)}</strong></div>
            </div>
            <div class="saved-note">✅ Заказ отправлен владельцу магазина</div>
            <button class="success-close">Понятно</button>
        </div>
    `;
    document.body.appendChild(success);
    success.querySelector(".success-close").addEventListener("click", () => success.remove());
    success.querySelector(".success-overlay").addEventListener("click", () => success.remove());
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
}

document.querySelectorAll(".product").forEach(card => {
    card.addEventListener("mousemove", e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        card.style.transform = `perspective(700px) rotateX(${-y * 6}deg) rotateY(${x * 6}deg) translateY(-8px)`;
    });
    card.addEventListener("mouseleave", () => card.style.transform = "");
});
