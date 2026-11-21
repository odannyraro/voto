# Voto

O sistema deve ter dois tipos de usuário: o admin, e o eleitor. O admin tem login e senha, edita informações da eleição, credencia eleitores, e administra os momentos de votação. O eleitor recebe de um admin um código único, individual e aleatório, válido apenas para aquela eleição, o insere na página inicial, e aguarda o início da eleição.

A dinâmica de votação é similar a de um kahoot: o admin seleciona o cargo a ser votado a seguir, aciona a eleição, e a partir deste momento todos os eleitores tem um prazo para votar naquele cargo. Após os eleitores, e apenas aqueles credenciados, terminarem de votar, ou acabar-se  prazo, os resultados são mostrados ao admin, que pode então liberá-los aos eleitores.

A configuração da eleição deve se dar nos seguintes termos:

Cargos: o admin deve poder configurar quantos cargos quiser para serem votados, e decidir se a ordem de desempate será por candidato mais novo ou mais velho, ou por tempo restante de permanência na universidade;

Candidatos: o admin deve poder criar um candidato, com seu nome, idade, e tempo restante de graduação ou tempo de permanência na universidade, e marcar a quais cargos ele está concorrendo, escolhendo tantos quanto quiser, mas marcando apenas um como "primeira opção". Quando for eleito para um cargo, o candidato está automaticamente excluído da eleição dos cargos que serão votados a seguir, mesmo que tenha se candidatado.

Segundo turno: caso hajam mais de 2 candidatos, e nenhum alcance mais de 50% dos votos válidos, deve ser disponibilizado para o admin, logo após a votação deste cargo, um segundo turno com os dois candidatos mais votados. Caso haja um empate triplo ou ainda maior, devem ser desempatados pelo método escolhido na configuração do cargo, e enviados dois candidatos para o segundo turno.

Candidatos insuficientes: se em algum momento algum cargo for o próximo na ordem, mas não tiver candidatos disponíveis (desde o começo, ou caso todos os candidatos já tenham ocupado outros cargos) o admin deve ter duas opções bem acessíveis: adicionar um candidato já existente de outros cargos, mas que não tenha sido eleito para nenhum cargo ainda, ou adicionar novos candidatos antes de seguir para o cargo que estava sem candidatos. Caso não queira nenhuma dasopções no momento, o admin deve poder mover o cargo para o fim da fila. Em último caso, travado por pop-ups de confirmação inconvenientes, o admin deve poder cancelar a eleição daquele cargo.

Ordem de votação: a princípio, o admin deve escolher a ordem de votação dos cargos. Em um estágio mais avançado de desenvolvimento da solução, um algoritmo deve pode ser ativado por um botão, que automaticamente prioriza cargos com múltiplos candidatos, especialmente se algum desses candidatos estiver concorrendo a outros cargos, para já resolver conflitos que travem o processo eleitoral.

Resiliência: como muitos dos requisitos da eleição são experimentais em um ambiente automatizado que exerça imposição de regras de design, o admin deve poder refazer passos da eleição com mais liberdade, para o caso de o sistema gerar algum comportamento inesperado que atrapalhe o andamento da eleição.
