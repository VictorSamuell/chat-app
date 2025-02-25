document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('username-form');
    const usernameInput = document.getElementById('username-input');

    form.addEventListener('submit', (e) =>{
        e.preventDefault();
        const username = usernameInput.value.trim();
        if(username){
            localStorage.setItem('username', username);
            window.location.href = 'chat.html';
        }
    
    });

});